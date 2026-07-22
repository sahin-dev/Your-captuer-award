

export function registerListeners (){

    require('./listeners/logger.event')
    require ('./listeners/notification.event')
    require('./listeners/contest.event')
    require('./listeners/level.event')
}