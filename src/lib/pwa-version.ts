// Anforderung 2.5, Phase 7: Kennung des aktuellen Deployments fuer die
// Service-Worker-Cache-Versionierung (siehe public/sw.js).
// VERCEL_GIT_COMMIT_SHA wird von Vercel bei jedem Deployment automatisch
// gesetzt - stabil ueber die gesamte Laufzeit dieses Deployments,
// unterschiedlich vom naechsten. Lokal (kein Vercel-Kontext) gibt es kein
// sinnvolles Aequivalent - "dev" reicht dort, ein Neustart des Dev-Servers
// macht eine alte Service-Worker-Version durch den naechsten
// Hot-Reload-Zyklus ohnehin irrelevant.
export function appVersion(): string {
  return process.env.VERCEL_GIT_COMMIT_SHA ?? "dev";
}
