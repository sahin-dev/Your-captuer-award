FROM node:alpine
WORKDIR /myapp
COPY /src ./src
COPY package.json .
COPY package-lock.json .
COPY prisma prisma

RUN npm i
RUN npm run build
ENV DATABASE_URL=mongodb+srv://sahin:sahin@captureaward.fj9m1qs.mongodb.net/captureaward?retryWrites=true&w=majority&appName=captureaward
CMD npm run prod
