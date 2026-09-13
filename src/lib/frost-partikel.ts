// Frostkristalle fuer die 60-Minuten-Szene. Die Bewegung traegt eine Aussage:
// Je weiter die Uhr nach dem Pfluecken laeuft, desto kaelter wird das Bild.
// Die Staerke kommt deshalb aus dem Zeitfortschritt der Szene und nicht aus
// einem Selbstzweck. Canvas 2D statt WebGL: rund hundert Teilchen schafft
// jedes Telefon, und die Seite braucht dafuer keine 3D-Bibliothek.

type Kristall = {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  winkel: number;
  drehung: number;
  deckkraft: number;
};

export class FrostPartikel {
  private readonly ctx: CanvasRenderingContext2D | null;
  private kristalle: Kristall[] = [];
  private breite = 0;
  private hoehe = 0;
  private staerke = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d");
  }

  /** Nach jeder Groessenaenderung aufrufen. Verteilt die Kristalle neu. */
  anpassen() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.breite = this.canvas.clientWidth;
    this.hoehe = this.canvas.clientHeight;
    this.canvas.width = Math.round(this.breite * dpr);
    this.canvas.height = Math.round(this.hoehe * dpr);
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    const anzahl = Math.max(30, Math.min(140, Math.round((this.breite * this.hoehe) / 12000)));
    this.kristalle = Array.from({ length: anzahl }, () => this.neu(true));
  }

  /** 0 = unsichtbar, 1 = volle Deckkraft. */
  setzeStaerke(wert: number) {
    this.staerke = Math.max(0, Math.min(1, wert));
  }

  /** Ein Bildschritt, `dt` in Sekunden. */
  schritt(dt: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.breite, this.hoehe);
    if (this.staerke <= 0.01) return;

    ctx.strokeStyle = "rgb(222, 246, 252)";
    ctx.fillStyle = "rgb(222, 246, 252)";
    ctx.lineCap = "round";

    for (const k of this.kristalle) {
      k.x += k.vx * dt;
      k.y += k.vy * dt;
      k.winkel += k.drehung * dt;
      if (k.y - k.r > this.hoehe || k.x - k.r > this.breite) Object.assign(k, this.neu(false));

      ctx.globalAlpha = k.deckkraft * this.staerke;
      if (k.r < 2.4) {
        ctx.beginPath();
        ctx.arc(k.x, k.y, k.r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        this.stern(ctx, k);
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Sechsstrahliger Kristall - die Grundform einer Schneeflocke. */
  private stern(ctx: CanvasRenderingContext2D, k: Kristall) {
    ctx.save();
    ctx.translate(k.x, k.y);
    ctx.rotate(k.winkel);
    ctx.lineWidth = Math.max(0.8, k.r / 5);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * k.r, Math.sin(a) * k.r);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** Neuer Kristall: beim Start ueber die Flaeche verteilt, danach vom Rand oben oder links. */
  private neu(verteilt: boolean): Kristall {
    const r = Math.random() < 0.72 ? 0.8 + Math.random() * 1.5 : 3 + Math.random() * 5;
    const vonOben = Math.random() < 0.5;
    return {
      x: verteilt ? Math.random() * this.breite : vonOben ? Math.random() * this.breite : -r,
      y: verteilt ? Math.random() * this.hoehe : vonOben ? -r : Math.random() * this.hoehe,
      r,
      vx: 6 + Math.random() * 14,
      vy: 10 + Math.random() * 22,
      winkel: Math.random() * Math.PI,
      drehung: (Math.random() - 0.5) * 0.6,
      deckkraft: 0.35 + Math.random() * 0.5,
    };
  }
}
