import { getLogger } from '../logging/agent';
import { ExperimentPlan, ValidationRun } from './types';
import { updateValidationRun } from './store';

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function simulateExperiment(exp: ExperimentPlan, targetBaseUrl: string): Promise<void> {
  const logger = getLogger();
  logger.info('drha.experiment.start', { expId: exp.id, kind: exp.kind, targetBaseUrl });

  // NOTE: In a real implementation, this is where we would:
  // - call Litmus Chaos APIs
  // - monitor target health via probes/metrics
  // For now we just delay to simulate time passing.
  await sleep(2000);

  logger.info('drha.experiment.end', { expId: exp.id, kind: exp.kind, targetBaseUrl });
}

export async function runValidationAsync(run: ValidationRun, targetBaseUrl: string): Promise<void> {
  const logger = getLogger();
  logger.info('drha.run.start', { runId: run.id, profileId: run.profileId });

  const startedAt = Date.now();
  updateValidationRun(run.id, { status: 'running', startedAt });

  try {
    for (const exp of run.experiments) {
      await simulateExperiment(exp, targetBaseUrl);
    }

    // For now, compute simple placeholder metrics; in a real version we would:
    // - query /metrics.json or external observability
    // - derive availability and RTO/RPO from chaos windows.
    const completedAt = Date.now();
    const totalSeconds = (completedAt - startedAt) / 1000;

    updateValidationRun(run.id, {
      completedAt,
      status: 'completed',
      rtoSecondsObserved: totalSeconds,
      rpoSecondsObserved: totalSeconds, // placeholder
      availabilityObserved: 1, // placeholder (no downtime simulated)
      verdict: 'pass'
    });
    logger.info('drha.run.completed', { runId: run.id, profileId: run.profileId });
  } catch (err: any) {
    const completedAt = Date.now();
    updateValidationRun(run.id, {
      completedAt,
      status: 'failed',
      failureReason: err?.message || String(err)
    });
    logger.error('drha.run.failed', { runId: run.id, profileId: run.profileId, error: err?.message || String(err) });
  }
}

