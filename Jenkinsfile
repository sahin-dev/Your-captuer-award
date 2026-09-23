// Your Capture Awards API - CI/CD
//
// Target: DigitalOcean Droplet running PM2 in cluster mode (ecosystem.config.js)
// against MongoDB Atlas, with uploads on DigitalOcean Spaces. The Dockerfile and
// docker-compose.yaml in this repo are local-development only and are
// deliberately not used here.
//
// Deploys are atomic: each build lands in its own timestamped release directory
// and only becomes live when a symlink is swapped, so a rollback is another
// symlink swap rather than a rebuild.
//
// Required Jenkins credentials (Manage Jenkins > Credentials):
//   yca-deploy-ssh          SSH Username with private key - the deploy user
//   yca-known-hosts         Secret file - ssh-keyscan output for the droplet(s)
//   yca-deploy-host-prod    Secret text - production host or IP
//   yca-deploy-host-staging Secret text - staging host or IP
//   yca-health-url-prod     Secret text - e.g. https://api.yourcaptureawards.com
//   yca-health-url-staging  Secret text
//
// The application's own secrets (DATABASE_URL, JWT_SECRET, DO_SPACE_*, OAuth
// credentials) are NOT injected by this pipeline. They live in
// <APP_ROOT>/shared/.env on the droplet, owned by the deploy user and chmod 600,
// and are symlinked into each release. Keeping them off the CI server means a
// compromised Jenkins does not hand over the database and object storage.

pipeline {
  // The agent must be Linux with the same libc/OpenSSL as the droplet. The
  // Prisma generator in prisma/schema.prisma has no binaryTargets set, so it
  // emits a query engine for the build machine only ("native"). Building on
  // Alpine and deploying to Ubuntu produces a binary the droplet cannot load.
  // See NOTE-1 at the bottom of this file to remove that constraint.
  agent { label 'linux && nodejs20' }

  options {
    disableConcurrentBuilds()
    timeout(time: 30, unit: 'MINUTES')
    buildDiscarder(logRotator(numToKeepStr: '30', artifactNumToKeepStr: '10'))
    timestamps()
  }

  parameters {
    choice(
      name: 'DEPLOY_ENV',
      choices: ['none', 'staging', 'production'],
      description: 'Where to deploy after a green build. "none" runs verification only.'
    )
    booleanParam(
      name: 'RUN_DB_PUSH',
      defaultValue: false,
      description: 'Run "prisma db push" against the target database. Only needed when prisma/*.prisma changed (it creates MongoDB indexes). Applied before the app reloads.'
    )
    booleanParam(
      name: 'STRICT_LINT',
      defaultValue: true,
      description: 'Fail the build on any ESLint error or warning.'
    )
  }

  environment {
    CI                = 'true'
    // NODE_ENV is deliberately NOT set to production here. The build needs its
    // devDependencies (tsc, eslint, ts-node, the Prisma CLI), and the runtime
    // gets NODE_ENV from ecosystem.config.js on the droplet anyway.
    NPM_CONFIG_FUND   = 'false'
    NPM_CONFIG_AUDIT  = 'false'
    NPM_CONFIG_COLOR  = 'false'

    // prisma generate/validate resolve datasource.url but never connect, so a
    // syntactically valid placeholder is enough and no real credential from a
    // live database is exposed to the build.
    DATABASE_URL      = 'mongodb://placeholder:27017/build?replicaSet=rs0'

    APP_ROOT          = '/srv/yourcapture-api'
    RELEASES_TO_KEEP  = '5'
    ARTIFACT          = 'release.tar.gz'
  }

  stages {

    stage('Checkout') {
      steps {
        checkout scm
        script {
          // Shelling out rather than using Groovy's Date/TimeZone classes, which
          // the Jenkins script-security sandbox rejects unless approved.
          env.GIT_SHA    = sh(script: 'git rev-parse --short=12 HEAD', returnStdout: true).trim()
          env.BUILD_TS   = sh(script: 'date -u +%Y%m%d-%H%M%S', returnStdout: true).trim()
          env.RELEASE_ID = "${env.BUILD_TS}-${env.GIT_SHA}"
          // BRANCH_NAME is only populated by multibranch jobs; fall back to the
          // checked-out ref so the production branch guard below always has a
          // real value to test.
          env.GIT_BRANCH_NAME = env.BRANCH_NAME ?: sh(
            script: 'git rev-parse --abbrev-ref HEAD', returnStdout: true
          ).trim()
          currentBuild.displayName = "#${env.BUILD_NUMBER} ${env.GIT_SHA}"
          currentBuild.description = "${params.DEPLOY_ENV} / ${env.GIT_BRANCH_NAME}"
        }
        // npm ci refuses to run without a lockfile, and installing without one
        // would silently drift from the reviewed dependency set.
        sh 'test -f package-lock.json || { echo "package-lock.json is required for reproducible installs"; exit 1; }'
      }
    }

    stage('Install') {
      steps {
        // npm ci installs strictly from the lockfile and wipes node_modules
        // first, so a build can never inherit state from the previous one.
        // postinstall runs "prisma generate", which is wanted here: the
        // generated client is gitignored (src/prismaClient/).
        sh 'npm ci'
        sh 'node -v && npm -v && npx prisma -v'
      }
    }

    stage('Verify') {
      parallel {
        stage('Typecheck') {
          steps { sh 'npx tsc --noEmit' }
        }
        stage('Lint') {
          steps {
            script {
              def strict = params.STRICT_LINT ? '--max-warnings=0' : ''
              def status = sh(script: "npx eslint . ${strict}", returnStatus: true)
              if (status != 0) {
                if (params.STRICT_LINT) {
                  error('ESLint reported problems. Fix them, or re-run with STRICT_LINT unchecked to triage.')
                }
                unstable('ESLint reported problems (non-blocking: STRICT_LINT is off).')
              }
            }
          }
        }
        stage('Prisma schema') {
          steps { sh 'npx prisma validate --schema=./prisma' }
        }
      }
    }

    stage('Test') {
      // "npm test" is intentionally not used - package.json defines it as a
      // failing placeholder. These are the real suites.
      parallel {
        stage('contest')     { steps { sh 'npm run test:contest' } }
        stage('vote')        { steps { sh 'npm run test:vote' } }
        stage('upload')      { steps { sh 'npm run test:upload' } }
        stage('transaction') { steps { sh 'npm run test:transaction' } }
        stage('team')        { steps { sh 'npm run test:team' } }
      }
    }

    stage('Security') {
      parallel {
        stage('Dependency audit') {
          steps {
            // Blocks on high/critical only. Moderate findings are reported but
            // do not gate, so a transitive advisory cannot stop a hotfix.
            script {
              def status = sh(script: 'npm audit --omit=dev --audit-level=high', returnStatus: true)
              if (status != 0) {
                error('npm audit found high or critical vulnerabilities in production dependencies.')
              }
            }
            sh 'npm audit --omit=dev --json > npm-audit.json || true'
            archiveArtifacts artifacts: 'npm-audit.json', allowEmptyArchive: true, fingerprint: true
          }
        }
        stage('Secret scan') {
          steps {
            // Catches a credential committed by mistake before it ships. The
            // repo already tracks .env.example (safe) while .env is gitignored.
            script {
              if (sh(script: 'command -v gitleaks', returnStatus: true) == 0) {
                sh 'gitleaks detect --source . --redact --no-banner --exit-code 1'
              } else {
                unstable('gitleaks is not installed on this agent - secret scanning was skipped.')
              }
            }
          }
        }
        stage('Committed secrets guard') {
          steps {
            // Defence in depth: .env must never be in the tree Jenkins builds.
            sh '''
              if git ls-files --error-unmatch .env >/dev/null 2>&1; then
                echo ".env is tracked by git - remove it from version control and rotate every value in it."
                exit 1
              fi
            '''
          }
        }
      }
    }

    stage('Build') {
      steps {
        // prisma generate -> tsc -> copy src/prismaClient into dist/prismaClient
        sh 'npm run build'
        sh 'test -f dist/server.js || { echo "build did not produce dist/server.js"; exit 1; }'
        sh 'test -d dist/prismaClient || { echo "generated Prisma client missing from dist"; exit 1; }'
      }
    }

    stage('Package') {
      steps {
        // Only what the droplet needs to run. Source, tests and dev tooling are
        // left behind; node_modules is installed on the target so the
        // production tree never contains dev dependencies.
        sh '''
          set -eu
          rm -rf .package "${ARTIFACT}"
          mkdir -p .package
          cp -r dist .package/
          cp -r prisma .package/
          cp package.json package-lock.json ecosystem.config.js .package/
          # prisma.config.ts is intentionally left out: the Prisma CLI would try
          # to load it during "db push" and it imports prisma/config, a
          # devDependency absent from the production install. The explicit
          # --schema=./prisma flag covers what it would have provided.
          echo "${RELEASE_ID}" > .package/RELEASE
          tar -czf "${ARTIFACT}" -C .package .
          rm -rf .package
          ls -lh "${ARTIFACT}"
        '''
        archiveArtifacts artifacts: "${ARTIFACT}", fingerprint: true
      }
    }

    stage('Approval') {
      when { expression { params.DEPLOY_ENV == 'production' } }
      steps {
        timeout(time: 15, unit: 'MINUTES') {
          input(
            message: "Deploy ${env.GIT_SHA} to PRODUCTION?",
            ok: 'Deploy',
            submitterParameter: 'APPROVER'
          )
        }
      }
    }

    stage('Deploy') {
      when { expression { params.DEPLOY_ENV != 'none' } }
      steps {
        script {
          // Production ships only from the mainline. A green feature branch can
          // still be released to staging.
          if (params.DEPLOY_ENV == 'production' && env.GIT_BRANCH_NAME != 'master') {
            error("Production deploys are only permitted from master (this build is '${env.GIT_BRANCH_NAME}').")
          }
          env.HOST_CRED   = params.DEPLOY_ENV == 'production' ? 'yca-deploy-host-prod'  : 'yca-deploy-host-staging'
          env.HEALTH_CRED = params.DEPLOY_ENV == 'production' ? 'yca-health-url-prod'   : 'yca-health-url-staging'
          // Surfaced as an environment variable so the deploy shell can read it
          // without string-concatenating a parameter into the script body.
          env.RUN_DB_PUSH = params.RUN_DB_PUSH.toString()
        }

        withCredentials([
          sshUserPrivateKey(credentialsId: 'yca-deploy-ssh', keyFileVariable: 'SSH_KEY', usernameVariable: 'SSH_USER'),
          file(credentialsId: 'yca-known-hosts', variable: 'KNOWN_HOSTS'),
          string(credentialsId: env.HOST_CRED, variable: 'DEPLOY_HOST')
        ]) {
          // set +x so the host and key path never reach the console log.
          // StrictHostKeyChecking=yes with a pinned known_hosts file prevents a
          // man-in-the-middle from receiving the release and its env access.
          sh '''
            set -eu
            set +x
            SSH_OPTS="-i ${SSH_KEY} -o UserKnownHostsFile=${KNOWN_HOSTS} -o StrictHostKeyChecking=yes -o IdentitiesOnly=yes -o ConnectTimeout=15"

            scp ${SSH_OPTS} "${ARTIFACT}" "${SSH_USER}@${DEPLOY_HOST}:/tmp/${RELEASE_ID}.tar.gz"

            ssh ${SSH_OPTS} "${SSH_USER}@${DEPLOY_HOST}" \
              APP_ROOT="${APP_ROOT}" \
              RELEASE_ID="${RELEASE_ID}" \
              RELEASES_TO_KEEP="${RELEASES_TO_KEEP}" \
              RUN_DB_PUSH="${RUN_DB_PUSH}" \
              'bash -seu' <<'REMOTE'
                RELEASE_DIR="${APP_ROOT}/releases/${RELEASE_ID}"
                SHARED_DIR="${APP_ROOT}/shared"

                test -f "${SHARED_DIR}/.env" || { echo "missing ${SHARED_DIR}/.env on the target"; exit 1; }

                mkdir -p "${RELEASE_DIR}" "${SHARED_DIR}/uploads"
                tar -xzf "/tmp/${RELEASE_ID}.tar.gz" -C "${RELEASE_DIR}"
                rm -f "/tmp/${RELEASE_ID}.tar.gz"

                # Secrets and user uploads are shared state, not part of a
                # release. app.ts serves /uploads from process.cwd(), so this
                # symlink is what keeps previously uploaded files reachable
                # after the release directory changes.
                ln -sfn "${SHARED_DIR}/.env"     "${RELEASE_DIR}/.env"
                ln -sfn "${SHARED_DIR}/uploads"  "${RELEASE_DIR}/uploads"

                cd "${RELEASE_DIR}"
                # --omit=dev keeps dev tooling off the production host.
                # --ignore-scripts blocks dependency lifecycle scripts (supply
                # chain hardening) and is safe here because the Prisma client
                # was already generated during the build and ships in dist/.
                npm ci --omit=dev --ignore-scripts

                if [ "${RUN_DB_PUSH}" = "true" ]; then
                  echo "Applying schema with prisma db push"
                  # The Prisma CLI is a devDependency, so it is fetched on demand
                  # rather than installed into the production tree.
                  set -a; . "${SHARED_DIR}/.env"; set +a
                  npx --yes prisma@6.18.0 db push --schema=./prisma --skip-generate
                fi

                # Record what was live before the swap so the pipeline can put
                # it back if the health check fails.
                if [ -L "${APP_ROOT}/current" ]; then
                  readlink -f "${APP_ROOT}/current" > "${APP_ROOT}/previous_release"
                fi

                # Atomic swap: ln -T onto a temp name then mv -T replaces the
                # symlink in one rename(2), so no request ever resolves a
                # half-updated path.
                ln -sfnT "${RELEASE_DIR}" "${APP_ROOT}/current.tmp"
                mv -Tf "${APP_ROOT}/current.tmp" "${APP_ROOT}/current"

                cd "${APP_ROOT}/current"
                # reload (not restart) rolls the cluster one worker at a time.
                # server.ts closes the HTTP server, stops Agenda and disconnects
                # Prisma on SIGINT/SIGTERM, so in-flight work drains cleanly.
                pm2 reload ecosystem.config.js --update-env || pm2 start ecosystem.config.js
                pm2 save

                # Keep a bounded history of rollback targets.
                cd "${APP_ROOT}/releases"
                ls -1dt */ | tail -n +$((RELEASES_TO_KEEP + 1)) | xargs -r rm -rf
REMOTE
          '''
        }
      }
    }

    stage('Smoke test') {
      when { expression { params.DEPLOY_ENV != 'none' } }
      steps {
        withCredentials([string(credentialsId: env.HEALTH_CRED, variable: 'HEALTH_URL')]) {
          // GET / is a genuine readiness signal: startServer() only calls
          // app.listen() after the database connects, transaction support is
          // asserted and Agenda has started.
          sh '''
            set -eu
            set +x
            for attempt in $(seq 1 10); do
              code=$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 10 "${HEALTH_URL}/" || echo 000)
              if [ "$code" = "200" ]; then
                echo "health check passed on attempt ${attempt}"
                exit 0
              fi
              echo "health check attempt ${attempt} returned ${code}; retrying"
              sleep 6
            done
            echo "health check never returned 200"
            exit 1
          '''
        }
      }
    }
  }

  post {
    failure {
      script {
        // Only roll back a deploy that actually swapped the symlink. A failure
        // during lint or tests must not touch the running server.
        if (params.DEPLOY_ENV != 'none' && env.HOST_CRED) {
          withCredentials([
            sshUserPrivateKey(credentialsId: 'yca-deploy-ssh', keyFileVariable: 'SSH_KEY', usernameVariable: 'SSH_USER'),
            file(credentialsId: 'yca-known-hosts', variable: 'KNOWN_HOSTS'),
            string(credentialsId: env.HOST_CRED, variable: 'DEPLOY_HOST')
          ]) {
            sh '''
              set -eu
              set +x
              SSH_OPTS="-i ${SSH_KEY} -o UserKnownHostsFile=${KNOWN_HOSTS} -o StrictHostKeyChecking=yes -o IdentitiesOnly=yes -o ConnectTimeout=15"
              ssh ${SSH_OPTS} "${SSH_USER}@${DEPLOY_HOST}" APP_ROOT="${APP_ROOT}" 'bash -seu' <<'REMOTE' || echo "rollback could not run - inspect the host manually"
                if [ ! -s "${APP_ROOT}/previous_release" ]; then
                  echo "no previous release recorded; nothing to roll back to"
                  exit 0
                fi
                PREVIOUS=$(cat "${APP_ROOT}/previous_release")
                if [ ! -d "${PREVIOUS}" ]; then
                  echo "previous release ${PREVIOUS} no longer exists"
                  exit 1
                fi
                echo "rolling back to ${PREVIOUS}"
                ln -sfnT "${PREVIOUS}" "${APP_ROOT}/current.tmp"
                mv -Tf "${APP_ROOT}/current.tmp" "${APP_ROOT}/current"
                cd "${APP_ROOT}/current"
                pm2 reload ecosystem.config.js --update-env
                pm2 save
REMOTE
            '''
          }
        }
      }
    }
    // "cleanup" rather than "always": declarative post conditions run in a fixed
    // order with always BEFORE failure, so wiping the workspace there would
    // delete it out from under the rollback's sh step. cleanup runs last.
    cleanup {
      sh 'rm -f "${ARTIFACT}" || true'
      cleanWs(deleteDirs: true, notFailBuild: true)
    }
  }
}

// NOTE-1 - Removing the agent/droplet platform coupling
//   prisma/schema.prisma declares the client generator without binaryTargets,
//   so it emits a query engine only for the machine that ran the build. Adding
//   the droplet's target makes the artifact portable and lets this pipeline run
//   on any Linux agent (including a container):
//
//     generator client {
//       provider      = "prisma-client-js"
//       output        = "../src/prismaClient"
//       binaryTargets = ["native", "debian-openssl-3.0.x"]   // Ubuntu 22.04/24.04
//     }
//
// NOTE-2 - One-time droplet preparation expected by the Deploy stage
//     sudo adduser --system --group --home /srv/yourcapture-api deploy
//     sudo -u deploy mkdir -p /srv/yourcapture-api/{releases,shared/uploads}
//     sudo -u deploy install -m 600 /dev/null /srv/yourcapture-api/shared/.env
//     # populate shared/.env from .env.example, then:
//     sudo -u deploy pm2 startup    # run the command it prints, so PM2 survives reboot
//   Give the deploy user no sudo rights. It needs write access to
//   /srv/yourcapture-api and permission to run pm2 as itself, nothing more.
//
// NOTE-3 - Generate the known_hosts credential from a trusted network:
//     ssh-keyscan -H <droplet-ip> > known_hosts
//   Upload it as the "yca-known-hosts" secret file. Do not substitute
//   StrictHostKeyChecking=no; that silently accepts any host key and defeats
//   the protection this stage relies on.
