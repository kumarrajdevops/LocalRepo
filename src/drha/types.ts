export type DrHaProfile = {
  id: string;
  name: string;
  description?: string;
  targetBaseUrl: string; // application/web server base URL to probe during chaos
  rtoSeconds: number;
  rpoSeconds: number;
  availabilityTarget: number; // e.g. 0.999
  maxFailoverSeconds: number;
  createdAt: number;
  updatedAt: number;
};

export type ExperimentKind =
  | 'node_failure'
  | 'pod_kill'
  | 'network_partition'
  | 'latency_injection'
  | 'db_failover';

export type ExperimentPlan = {
  id: string;
  kind: ExperimentKind;
  description: string;
};

export type ValidationRunStatus = 'pending' | 'running' | 'completed' | 'failed';

export type ValidationRun = {
  id: string;
  profileId: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  status: ValidationRunStatus;
  experiments: ExperimentPlan[];
  rtoSecondsObserved?: number;
  rpoSecondsObserved?: number;
  availabilityObserved?: number;
  verdict?: 'pass' | 'fail';
  failureReason?: string;
};

