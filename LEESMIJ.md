# Streamline

Je eigen dashboard met links, actieknoppen, radio, to do's, notities en een
bijsnijdtool. Alles draait als één HTML-bestand op je eigen computer.
**Niets van wat je maakt of opslaat gaat naar internet.**

---

## 1. Starten

1. Zet de map `streamline` ergens neer, bijvoorbeeld in `Documenten`.
2. Open `streamline.html` in **Chrome** of **Edge** (dubbelklik; opent hij in
   een andere browser, rechtsklik → *Openen met* → Chrome of Edge).
3. Geef je dashboard een naam, kies licht of donker en klik **Map kiezen en
   starten**. Kies dan **dezelfde map** als waar `streamline.html` staat.
4. Chrome vraagt of Streamline in die map mag opslaan. Kies **Bij elk bezoek
   toestaan**, dan hoef je het niet steeds opnieuw te bevestigen.

Streamline maakt nu een bestand `jouw-naam.streamline.json` aan. Daarin staat
alles: je pagina's, widgets, to do's, notities en instellingen. Dit is gewoon
een tekstbestand; kopieer het als back-up of geef het aan een collega.

> Werk je in een browser zonder mappen-ondersteuning (zoals Firefox), dan
> bewaart Streamline alles in de browser. Via *Instellingen → Bestanden →
> Exporteren* maak je dan zelf een back-up.

## 2. Je dashboard aanpassen

- Klik op het **tandwiel** rechtsboven. Je ziet nu het raster en het
  paneel *Widgets*.
- Klik op een widget in het paneel om hem toe te voegen.
- **Verplaatsen:** pak een onderdeel bij de greep (het zwarte streepje
  bovenaan) of ergens op het onderdeel en sleep. Het klikt vast op het raster.
- **Groter of kleiner:** sleep het groene bolletje rechtsonder.
- **Knoppen per onderdeel** (zichtbaar als je eroverheen beweegt):
  instellingen, kopiëren, verwijderen en het **slotje**. Op slot = niet meer
  te verplaatsen, te wijzigen of te verwijderen.
- Een **achtergrondvak** kopiëren neemt alles mee wat erin staat.
- De panelen *Widgets* en *Instellingen* sleep je aan het streepje bovenaan.
- `Ctrl` + `Z` maakt de laatste wijziging ongedaan, `Esc` sluit de bewerkmodus.

## 3. De widgets

| Widget | Wat het doet |
|---|---|
| Paginamenu | Wisselen tussen pagina's. Horizontaal of verticaal, met iconen, namen of beide. |
| Titel | Kop boven een widget of groep. Lettertype en kleur stel je voor alle titels tegelijk in (Instellingen → Titels). `{groet}`, `{datum}` en `{tijd}` vullen zich vanzelf. |
| Achtergrondvak | Groepeert widgets. Kleur, doorzichtigheid, afronding en rand per vak. |
| Link-knop | Opent een website in een nieuw tabblad. Icoon uit de catalogus of de favicon van de site. |
| Actieknop | Opent één of meer websites en kan daarna wachten, klikken, velden invullen, tekst typen en toetsen indrukken. Met `{vraag:Zoekterm}` vraagt hij bij het klikken om een waarde. |
| Teamtaken / Teamleden | Zie hoofdstuk 8. |
| Radio | Nederlandse zenders (lijst van nederland.fm). Zenders zijn aan te passen. |
| To do's | Prioriteit hoog (rood), medium (oranje), laag (geel). Nieuwe taken worden op prioriteit ingevoegd; daarna versleep je ze zelf. Teamtaken op jouw naam staan er ook in. Sleep een e-mail uit Outlook erop: de onderwerpregel wordt de taak. Belletje = herinnering. |
| Notities | Notities met opmaak (vet, kopjes, lijsten, afvinklijst, markeren, links) en een herinnering. |
| Bijsnijden | Sleep één of meer afbeeldingen erin, kies per afbeelding een formaat en klik op het focuspunt. Download er één, allemaal, of allemaal in álle formaten (zip). Formaten stel je zelf in. |

**Herinneringen** geven een geluid, een melding in beeld en (als je dat
toestaat) een Windows-melding. Ze werken zolang Streamline open staat in een
tabblad.

## 4. Toetsaanslagen: de Streamline Helper

Een webpagina mag om veiligheidsredenen niet typen in andere tabbladen. Met de
kleine extensie in de map `helper-extensie` kan het wel:

1. Ga in Chrome naar `chrome://extensions` (in Edge: `edge://extensions`).
2. Zet rechtsboven **Ontwikkelaarsmodus** aan.
3. Klik **Uitgepakte extensie laden** en kies de map `helper-extensie`.
4. Klik bij *Streamline Helper* op **Details** en zet
   **Toegang tot bestands-URL's toestaan** aan.
5. Ververs Streamline. Bij *Instellingen → Over* zie je of de helper actief is.

Zonder helper openen actieknoppen wel de websites en zetten ze de tekst klaar
op je klembord. Opent er maar één tabblad? Klik dan op het pop-up-icoon in de
adresbalk en kies *Altijd toestaan*.

## 5. Updates via GitHub

1. Maak op GitHub een (privé-)repository, bijvoorbeeld `streamline`.
2. Upload de inhoud van deze map (het bestand `.gitignore` zorgt ervoor dat je
   persoonlijke `*.streamline.json`-bestanden en backups **niet** meegaan).
3. Streamline haalt updates standaard op uit `MehMienLepke/streamline`. Wil je
   een eigen kopie (fork) gebruiken, vul dan bij *Instellingen → Updates* je
   eigen repository in.

Een nieuwe versie uitbrengen:

1. Vervang `streamline.html` in de repository door de nieuwe versie.
2. Pas `version.json` aan: hoger versienummer, en `"groot": true` als het
   een grote update is. In `notes` zet je wat er nieuw is.

Streamline toont dan rechtsboven een **Update**-knop. Die maakt eerst een
reservekopie in de map `backups`, vervangt alleen het HTML-bestand en ververst
de pagina. Je instellingenbestand blijft onaangeroerd.

> Een **privé**-repository werkt niet voor de updateknop, omdat Streamline
> geen wachtwoorden of sleutels opslaat. Kies een openbare repository (je
> persoonlijke instellingen staan er toch niet in) of werk handmatig bij.

## 6. Eigen widgets toevoegen

Zet een JavaScript-bestand in de map `widgets/` van je repository en meld het
aan in `widgets/registry.json`. Kijk naar `widgets/klok.js` als voorbeeld.
Daarna: *Instellingen → Uitbreidingen → Widgets ophalen van GitHub →
Installeren*. De widget verschijnt in het widgetpaneel onder *Uitbreidingen*.

## 7. Meerdere instellingenbestanden

In *Instellingen → Bestanden* kun je:

- wisselen tussen instellingenbestanden in dezelfde map;
- een nieuw bestand maken of het huidige dupliceren;
- exporteren en importeren (bijvoorbeeld een preset van een collega);
- via **Kopiëren…** losse widgets, complete vakken of hele pagina's van het
  ene bestand naar het andere kopiëren.

## 8. Samenwerken in een team

Met een team deel je taken met collega's via een gedeelde map, bijvoorbeeld op
OneDrive of in Teams/SharePoint. Je eigen dashboard blijft van jou: alleen wat
op het **team-tabblad** (icoon met drie poppetjes) staat, wordt gedeeld. Hoe dat
tabblad eruitziet, bepaalt ieder zelf; de taken zijn voor iedereen hetzelfde.

**Een team maken** — *Instellingen → Team → Nieuw team maken.* Geef het team een
naam, vul je voornaam en een wachtwoord in, en kies een plek die je collega's
ook kunnen bereiken. Streamline maakt daar de map `Streamline team - Naam`.

**Collega's laten aansluiten**
1. Deel die map via OneDrive/SharePoint met je collega's (met bewerkrechten).
2. Zij kiezen in OneDrive bij die map **Snelkoppeling toevoegen aan Mijn
   bestanden**, zodat de map op hun computer staat.
3. In Streamline: *Instellingen → Team → Aansluiten bij een team*, de map kiezen
   en het wachtwoord invullen.
4. Geef het wachtwoord persoonlijk of via een ander kanaal, niet via de map.

**Teamtaken**
- Typ een taak of sleep een e-mail uit Outlook erin: het onderwerp wordt de
  titel. Streamline vraagt of je ook de inhoud en de bijlagen wilt delen. Bij
  *Instellingen → Team* zet je dat op *Elke keer vragen*, *Standaard aan* of
  *Standaard uit*.
- Met het poppetje rechts wijs je een taak toe aan een collega (met zijn of haar
  foto). Die krijgt een melding en ziet de taak in de eigen takenlijst met het
  teamicoontje, standaard bovenaan.
- In je eigen takenlijst versleep je taken aan het streepje links om zelf de
  volgorde te bepalen.
- Klik op een taak om hem te openen: titel, prioriteit, toewijzing, de e-mail en
  bijlagen.

**Naam en foto** — *Instellingen → Team → Jouw profiel*, of klik op jezelf in de
widget *Teamleden*.

**Gelijktijdig werken**
- Iedereen schrijft alleen in een eigen bestandje in de teammap. Daardoor maakt
  OneDrive geen "conflict-kopieën" en raakt er niets kwijt.
- Wijzigingen worden direct opgeslagen. Hoe snel collega's ze zien, hangt af van
  OneDrive: meestal binnen enkele seconden, soms een minuut.
- Heeft iemand een taak open, dan zien anderen een slotje met zijn of haar naam
  en kunnen ze de taak tijdelijk alleen bekijken.
- Wijzigen twee mensen toch tegelijk hetzelfde (bijvoorbeeld voordat OneDrive
  klaar was met synchroniseren), dan wint de laatste wijziging en krijgt de taak
  een oranje waarschuwing met wat de ander had ingevuld.

**Wachtwoord en beveiliging**
- Alles in de teammap (taken, e-mails, bijlagen, namen en foto's) is versleuteld
  met het teamwachtwoord (AES-256). Wie de map opent zonder wachtwoord, ziet
  alleen onleesbare tekst. Alleen de teamnaam is leesbaar.
- Streamline onthoudt je toegang versleuteld in je eigen instellingenbestand,
  en die toegang werkt alleen op jouw computer. Deel je je persoonlijke
  instellingen met iemand, dan geef je dus géén toegang tot het team.
- De maker van het team kan het wachtwoord wijzigen. Daarna moet iedereen het
  nieuwe wachtwoord één keer invullen.
- Wachtwoord kwijt = gegevens kwijt. Er is geen herstel.

## 9. Privacy in het kort

- Je gegevens staan alleen in je eigen map en in je eigen browser.
- De pagina bevat een *Content Security Policy*: de browser blokkeert elke
  poging om gegevens te versturen. Alleen het **lezen** van GitHub
  (updates/widgets) is toegestaan.
- Radiostreams, favicons en websites in je knoppen worden alleen geladen
  wanneer je ze zelf gebruikt.
- Afbeeldingen in de bijsnijdtool verlaten je computer nooit.

## Voor ontwikkelaars

De broncode staat in `src/`. Na een wijziging bouw je `streamline.html`
opnieuw met `python build.py` (dit werkt ook `version.json` bij).
