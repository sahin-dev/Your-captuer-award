

export function registerListeners (){

    require('./listeners/logger.event')
    require ('./listeners/notification.event')
    require('./listeners/contest.event')
    // No level listener: a new user starts with no level (currentLevel -1,
    // voting_power 1 - the schema defaults) and earns APPRENTICE and above
    // through levelService.evaluateAndUpdateUserLevel.
}