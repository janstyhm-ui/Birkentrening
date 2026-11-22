# Birken 2027 – Treningsloggen

Norsk PWA for treningsperioden 23. november 2026 til 31. januar 2027. Kalenderen har 54 økter og inkluderer 20 styrkeøkter og 10 km testløp. Økter, resultater, endringshistorikk og kroppsvekt lagres i nettleseren på enheten.

## Kjør og installer

Kjør `python3 -m http.server 8000` i denne mappen og åpne `http://localhost:8000` for lokal testing. Last opp mappens innhold til en statisk vert med HTTPS, for eksempel GitHub Pages, for bruk på telefon. Relative filstier gjør at appen også kan ligge i en undermappe.

Åpne HTTPS-adressen i Chrome på Android. Velg **Installer app** eller **Legg til på startskjermen** i nettlesermenyen. Første åpning krever nett. Etter at appen har lastet ned offlinefilene, kan den åpnes, vise illustrasjoner og lagre økter uten nett.

Eksporter loggen fra **Innstillinger** før bytte av nettleser, adresse eller enhet. Import erstatter den lokale loggen og ber om bekreftelse hvis appen allerede har data. Sikkerhetskopien inneholder treningsloggen og kroppsvekter.

## Juster programmet

- `program.json` inneholder planen og stabile økt-ID-er. Behold eksisterende ID-er ved programjusteringer. Økter som allerede er endret eller registrert, beholder sin lokale versjon og historikk.
- `exercises.json` har de to styrkemalene med stabile øvelses-ID-er og lokale illustrasjoner. Behold øvelses-ID-er når oppskriften justeres med samme øvelse. Uke 1–2 har to arbeidssett. Uke 10 har ni arbeidssett i A og åtte i B, fordelt i `strengthVolume` i `program.json`.
- Øk versjonen i `cacheName` i `sw.js` ved publisering av endringer. Det utløser ny nedlasting av appen og programfilene.

De oppgitte settene per øvelse i styrke A gir 18 arbeidssett ved fullt program. Øvelseslisten styrer antallet.
