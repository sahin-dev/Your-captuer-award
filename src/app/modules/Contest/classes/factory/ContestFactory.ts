
import { SimpleContestBuilder } from '../SimpleContestBuilder'
import { RecurringContestBuilder } from '../RecurringContestBuilder'
import { AbstractContestBuilder } from '../AbstractContestBuilder'

export class ContestBuilderFactory {
  static create(type: 'normal' | 'recurring', creatorId: string): AbstractContestBuilder {
    if (type === 'recurring') {
      return new RecurringContestBuilder(creatorId)
    }
    return new SimpleContestBuilder(creatorId)
  }
}
