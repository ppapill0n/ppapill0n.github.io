// A separate seeded stream supplies market shocks. No account state or future
// event metadata leaves this closure. A shock's similar initial move can recover,
// leave part/all of its level change, or accompany a natural trend reversal.
export function createSweeps(random, config) {
  const settings = config.sweeps;
  if (!settings?.enabled) return { step: () => 0 };
  const dt = config.tickMs / 1000;
  const chance = 1 - Math.exp(-dt / settings.meanEligibleSeconds);
  const between = ([min, max]) => min + random() * (max - min);
  const ease = fraction => (1 - Math.cos(Math.PI * fraction)) / 2;
  let time = 0, readyAt = 0, level = 0, event = null;
  return {
    step(regime, previousRegime, drift) {
      time += dt;
      if (!event && time >= readyAt) {
        // Attach some shocks to *existing* up/down transitions. Never schedule,
        // delay or cancel a background regime change to manufacture a recovery.
        const reversal = regime !== 0 && previousRegime === -regime;
        const eligible = regime !== 0 && regime * drift > config.trendDrift * 0.5;
        const start = reversal ? random() < settings.reversalShockProbability : eligible && random() < chance;
        if (start) {
          const kind = random();
          const retained = kind < settings.fullRecoveryProbability ? 0
            : kind < settings.fullRecoveryProbability + settings.partialRecoveryProbability
              ? between(settings.retainedFraction) : 1;
          event = {
            start: time, direction: reversal ? regime : -regime,
            amplitude: between(random() < settings.largeProbability ? settings.largeAmplitude : settings.amplitude),
            attack: between(settings.attackSeconds), hold: between(settings.holdSeconds),
            recovery: between(settings.recoverySeconds), shape: between(settings.recoveryShape), retained,
          };
        }
      }
      if (!event) return level;
      const age = time - event.start, recoveryStart = event.attack + event.hold;
      let fraction;
      if (age < event.attack) fraction = ease(age / event.attack);
      else if (age < recoveryStart) fraction = 1;
      else if (age < recoveryStart + event.recovery) {
        const remaining = 1 - ease((age - recoveryStart) / event.recovery);
        fraction = event.retained + (1 - event.retained) * remaining ** event.shape;
      } else {
        level += event.direction * event.amplitude * event.retained;
        event = null; readyAt = time + settings.cooldownSeconds;
        return level;
      }
      return level + event.direction * event.amplitude * fraction;
    },
  };
}
