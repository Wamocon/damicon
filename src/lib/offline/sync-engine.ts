import { eintragEntfernen, sendbareEintraege, statusAktualisieren } from "@/lib/offline/warteschlange";
import type { WarteschlangenEintrag } from "@/lib/offline/db";

// Anforderung 2.5, Phase 2: verarbeitet die lokale Warteschlange gegen
// /api/sync. Bewusst sequenziell statt parallel - ab Phase 4 haengt die
// Konflikterkennung der drei Update-Workflows von der Reihenfolge ab, in der
// die Auftraege beim Server ankommen; sequenziell zu senden haelt das
// vorhersehbar, auch fuer die bereits jetzt angebundenen reinen Inserts.

interface SyncAntwort {
  ergebnis: "angewendet" | "konflikt" | "fehler";
  meldung: string;
  wert?: string;
}

export interface SyncErgebnis {
  verarbeitet: number;
  konflikte: number;
  fehlgeschlagen: number;
}

async function eintragSenden(eintrag: WarteschlangenEintrag): Promise<SyncAntwort> {
  // Fotobeleg (Phase 6) traegt eine Bilddatei mit - dafuer multipart/form-data
  // statt JSON, sonst muesste die Datei als Base64-String durch JSON, ~33%
  // groesser als das Original (relevant bei Vercels
  // Route-Handler-Payloadgrenze). Kein Content-Type-Header hier von Hand
  // gesetzt: der Browser ergaenzt die multipart-Boundary selbst, ein manuell
  // gesetzter Header ohne Boundary macht den Request auf Serverseite
  // unlesbar.
  if (eintrag.datei) {
    // Die Endung im mitgegebenen Dateinamen muss zum tatsaechlichen
    // MIME-Typ des Blobs passen - belegKern() liest die Endung serverseitig
    // aus genau diesem Namen. Ein hartcodiertes "beleg.jpg" wuerde die echte
    // Endung immer auf "jpg" verfaelschen, auch wenn
    // bildFuerWarteschlangeVerkleinern() aus gutem Grund (z. B. ein bereits
    // kleines Original) beim urspruenglichen Format (PNG, WebP, ...)
    // geblieben ist.
    const erweiterung = eintrag.datei.type.split("/")[1]?.split("+")[0] ?? "jpg";
    const form = new FormData();
    form.set("aktionId", eintrag.aktionId);
    form.set("aktionTyp", eintrag.aktionTyp);
    form.set("geraetZeitpunkt", eintrag.geraetZeitpunkt);
    form.set("nutzlast", JSON.stringify(eintrag.nutzlast));
    form.set("datei", eintrag.datei, `beleg.${erweiterung}`);
    const antwort = await fetch("/api/sync", { method: "POST", body: form });
    return (await antwort.json()) as SyncAntwort;
  }

  const antwort = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      aktionId: eintrag.aktionId,
      aktionTyp: eintrag.aktionTyp,
      geraetZeitpunkt: eintrag.geraetZeitpunkt,
      nutzlast: eintrag.nutzlast,
    }),
  });
  return (await antwort.json()) as SyncAntwort;
}

export async function synchronisiere(): Promise<SyncErgebnis> {
  const eintraege = await sendbareEintraege();
  const ergebnis: SyncErgebnis = { verarbeitet: 0, konflikte: 0, fehlgeschlagen: 0 };

  for (const eintrag of eintraege) {
    await statusAktualisieren(eintrag.aktionId, { status: "wird_gesendet" });

    try {
      const antwort = await eintragSenden(eintrag);

      if (antwort.ergebnis === "angewendet") {
        await eintragEntfernen(eintrag.aktionId);
        ergebnis.verarbeitet += 1;
      } else if (antwort.ergebnis === "konflikt") {
        await statusAktualisieren(eintrag.aktionId, {
          status: "konflikt",
          letzterFehler: antwort.meldung,
          verarbeitetAm: new Date().toISOString(),
        });
        ergebnis.konflikte += 1;
      } else {
        await statusAktualisieren(eintrag.aktionId, {
          status: "fehler",
          versuche: eintrag.versuche + 1,
          letzterFehler: antwort.meldung,
        });
        ergebnis.fehlgeschlagen += 1;
      }
    } catch (fehlerObjekt) {
      // Netzwerkfehler (z. B. gerade wieder offline gegangen, mitten im
      // Sync) - zurueck auf "wartend" statt "fehler", damit der naechste
      // automatische Versuch (online-Ereignis, Intervall) es ohne manuelles
      // Eingreifen erneut probiert.
      await statusAktualisieren(eintrag.aktionId, {
        status: "wartend",
        versuche: eintrag.versuche + 1,
        letzterFehler: fehlerObjekt instanceof Error ? fehlerObjekt.message : String(fehlerObjekt),
      });
      ergebnis.fehlgeschlagen += 1;
    }
  }

  return ergebnis;
}
