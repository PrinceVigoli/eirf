import { CASE_STATUSES, getStatusLabel, STATUS_DESCRIPTIONS } from "@/lib/incident-status";

export function CaseStatusHelp() {
  return <dl className="space-y-1 text-xs text-muted-foreground mt-3">
    {CASE_STATUSES.map(status => <div key={status}>
      <dt className="inline font-medium">{getStatusLabel(status)}: </dt>
      <dd className="inline">{STATUS_DESCRIPTIONS[status]}</dd>
    </div>)}
  </dl>;
}
