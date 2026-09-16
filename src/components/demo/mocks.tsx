// KuehlketteMock entfaellt (Anforderung 3.1): das Modul "kuehlkette" laeuft
// jetzt ueber die datenbankgestuetzte Ansicht in
// src/components/db/kuehlkette-ansicht.tsx, mit der bereits vorhandenen
// live mitzaehlenden KuehlkettenAlarm-Komponente statt drei fest
// verdrahteter Beispielchargen.

// QrSteigenMock entfaellt (WMCNL-1439): das Modul "qr_steigen" laeuft jetzt
// ueber die datenbankgestuetzte Ansicht in
// src/components/db/qr-steigen-ansicht.tsx, analog zu
// dokumente/standort/pflueckaufgaben/reihenbloecke/compliance. Die
// Scan-Oberflaeche am Ausgabepunkt (Server-Abgleich beim Abgeben) bleibt
// offen - dieser Ausbauschritt deckt Erzeugung/Anzeige/Druck ab, siehe
// modules.ts.

// KiAssistentMock entfaellt (Anforderung 5.4/5.5): das Modul "ki_assistent"
// laeuft jetzt ueber die datenbankgestuetzte Ansicht in
// src/components/db/ki-assistent-ansicht.tsx, mit echter Anbindung an einen
// per Admin konfigurierten KI-Anbieter statt eines reinen, lokal
// nachgestellten Chatfensters ohne Modellaufruf.
