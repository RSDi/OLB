"use client";
import { TRACKS } from "./tracks";
import { RequestWizard } from "./wizard";

// Thin client wrapper: the dynamic route passes only serializable props
// (trackKey + requesterName); the step config (with its body functions) is
// looked up here on the client.
export function TrackWizard({
  trackKey,
  requesterName,
  priorSteps,
}: {
  trackKey: string;
  requesterName: string | null;
  priorSteps?: number;
}) {
  const config = TRACKS[trackKey];
  if (!config) return null;
  return (
    <RequestWizard
      trackKey={config.key}
      title={config.title}
      steps={config.steps}
      initial={config.initial}
      successBody={config.successBody}
      requesterName={requesterName}
      priorSteps={priorSteps}
    />
  );
}
