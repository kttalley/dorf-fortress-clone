/**
 * Job system for v0.1
 * Jobs are tasks dwarves can claim and execute
 */

import { nextId, distance } from './entities.js';

// === JOB TYPES ===
export const JOB_TYPES = {
  IDLE: 'idle',
  FORAGE: 'forage',  // Go to food source and eat
};

// === JOB FACTORIES ===

/**
 * Create a forage job for a food source
 */
export function createForageJob(foodSource) {
  return {
    id: nextId(),
    type: JOB_TYPES.FORAGE,
    target: { x: foodSource.x, y: foodSource.y },
    foodSourceId: foodSource.id,
    claimedBy: null,  // Dwarf ID or null
    priority: 1,      // Higher = more urgent
  };
}

// === JOB QUEUE ===

/**
 * Create an empty job queue
 */
export function createJobQueue() {
  return [];
}

/**
 * Add job to queue
 */
export function addJob(queue, job) {
  queue.push(job);
}

/**
 * Find best unclaimed job for a dwarf
 * Prefers: closest, highest priority
 */
export function findBestJob(queue, dwarf) {
  let best = null;
  let bestScore = -Infinity;

  for (const job of queue) {
    if (job.claimedBy !== null) continue;

    const dist = distance(dwarf, job.target);
    // Score: priority bonus minus distance penalty
    const score = (job.priority * 100) - dist;

    if (score > bestScore) {
      bestScore = score;
      best = job;
    }
  }

  return best;
}

/**
 * Claim a job for a dwarf
 */
export function claimJob(job, dwarf) {
  job.claimedBy = dwarf.id;
}

/**
 * Release a claimed job
 */
export function releaseJob(job) {
  job.claimedBy = null;
}

/**
 * Remove a job from the queue
 */
export function removeJob(queue, jobId) {
  const index = queue.findIndex(j => j.id === jobId);
  if (index !== -1) {
    queue.splice(index, 1);
  }
}

/**
 * Get job claimed by a specific dwarf
 */
export function getClaimedJob(queue, dwarfId) {
  return queue.find(j => j.claimedBy === dwarfId) || null;
}
