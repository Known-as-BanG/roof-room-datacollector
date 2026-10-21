import type { AttemptRecord } from '../../shared/attempt';
import type { JobRecord, RunStatus } from '../../shared/run-job';
import { isTerminalRunStatus } from './run-execution-state-machine';

const settled = (status: string): boolean => ['COMPLETED', 'FAILED', 'CANCELLED'].includes(status);

export const canExportRunEvidence = (
  status: RunStatus,
  jobs: readonly Pick<JobRecord, 'execution_status' | 'validation_status' | 'accepted_artifact_id'>[],
  attempts: readonly Pick<AttemptRecord, 'execution_status'>[] = [],
): boolean => isTerminalRunStatus(status) || (
  status === 'RETRY_REQUIRED'
  && jobs.every((job) => settled(job.execution_status))
  && attempts.every((attempt) => settled(attempt.execution_status))
  && jobs.some((job) => job.execution_status === 'COMPLETED' && job.accepted_artifact_id !== null
    && ['VALID', 'LOW_DATA', 'NO_DATA'].includes(job.validation_status))
);
