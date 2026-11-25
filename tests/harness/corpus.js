// Test PDFs of the redaction harness, generated with pdf-lib (fictitious people and numbers only).
// Each case lists the personal data that must not be found anywhere in the export (`needles`) and, separately,
// known gaps of the rules (`knownGaps`, review 20.11.2026 finding 2) that are reported but do not fail the run.
// `ocrControl`: needles that OCR must read in the input (proves that the OCR check of the export can see them).
"use strict";
const { PDFDocument, PDFName, PDFString, PDFHexString, StandardFonts, degrees } = require("pdf-lib");

const FILLER = "Dies ist ein allgemeiner Fliesstext ohne personenbezogene Angaben, der die Seite ausreichend fuellt.";
const PERSON = {
  name: "Max Mustermann",
  iban: "DE89 3704 0044 0532 0130 00",
  email: "max.mustermann@example.com",
  phone: "+49 170 1234567",
  street: "Musterstrasse 12",
  taxId: "12345678995",
  birth: "12.03.1985"
};

async function newDoc() {
  const doc = await PDFDocument.create();
  doc.setProducer("harness");
  doc.setCreator("harness");
  return { doc, font: await doc.embedFont(StandardFonts.Helvetica) };
}

function writeLines(page, font, lines, { x = 50, y = 790, size = 11, filler = 8 } = {}) {
  const all = [...lines, ...Array(filler).fill(FILLER)];
  all.forEach((t, i) => page.drawText(t, { x, y: y - i * 18, size, font }));
}

/** FreeText annotation with an appearance stream, so pdf.js draws its text when the page is rendered. */
function addFreeText(doc, page, font, text, [x0, y0, x1, y1]) {
  const ctx = doc.context;
  const fontKey = "Helv";
  const content = `BT /${fontKey} 10 Tf 2 ${((y1 - y0) / 2 - 3).toFixed(1)} Td ${font.encodeText(text).toString()} Tj ET`;
  const ap = ctx.register(ctx.flateStream(content, {
    Type: "XObject", Subtype: "Form", BBox: [0, 0, x1 - x0, y1 - y0],
    Resources: { Font: { [fontKey]: font.ref } }
  }));
  const annot = ctx.register(ctx.obj({
    Type: "Annot", Subtype: "FreeText", Rect: [x0, y0, x1, y1], F: 4,
    Contents: PDFHexString.fromText(text), DA: PDFString.of("/Helv 10 Tf 0 g"), AP: { N: ap }
  }));
  page.node.addAnnot(annot);
}

const cases = [
  {
    file: "01_formularfelder.pdf",
    title: "Formularfelder: Textfeld, mehrzeilig, Combo-Box (Anzeige ≠ Exportwert), Listbox",
    needles: ["Erika Musterfrau", "Lindenweg 7", "Jürgen Weiß", "Anna Schmidt", "Bernd Meier", PERSON.email],
    ocrControl: ["Erika Musterfrau", "Jürgen Weiß", "Anna Schmidt", "Bernd Meier"],
    async build() {
      const { doc, font } = await newDoc();
      const p = doc.addPage([595, 842]);
      writeLines(p, font, ["Antrag auf Kostenerstattung", "Bitte alle Felder ausfuellen."], { filler: 12 });
      const form = doc.getForm();
      const name = form.createTextField("antragsteller");
      name.setText("Erika Musterfrau");
      // No border: Tesseract skips text that touches a thin frame, and the OCR check of the export must see it.
      name.addToPage(p, { x: 50, y: 415, width: 220, height: 26, font, borderWidth: 0 });
      const addr = form.createTextField("anschrift");
      addr.enableMultiline();
      addr.setText("Lindenweg 7\n10115 Berlin\n" + PERSON.email);
      addr.addToPage(p, { x: 50, y: 330, width: 260, height: 70, font });
      const combo = form.createDropdown("sachbearbeiter");
      combo.addOptions(["Jürgen Weiß", "Petra Klein"]);
      combo.select("Jürgen Weiß");
      combo.addToPage(p, { x: 50, y: 285, width: 220, height: 26, font, borderWidth: 0 });
      const list = form.createOptionList("vertreter");
      list.addOptions(["Anna Schmidt", "Bernd Meier"]);
      list.addToPage(p, { x: 50, y: 200, width: 220, height: 60, font });
      form.updateFieldAppearances(font);
      return doc.save();
    }
  },
  {
    file: "02_freetext_kommentar.pdf",
    title: "FreeText-Kommentar mit Erscheinungsbild",
    needles: ["Erika Musterfrau", "erika@example.org"],
    ocrControl: ["Erika Musterfrau"],
    async build() {
      const { doc, font } = await newDoc();
      const p = doc.addPage([595, 842]);
      writeLines(p, font, ["Interne Notiz zum Vorgang 4711"], { filler: 14 });
      addFreeText(doc, p, font, "Rueckruf Frau Erika Musterfrau, erika@example.org", [50, 300, 400, 330]);
      return doc.save();
    }
  },
  {
    file: "03_mehrseitig.pdf",
    title: "4 Seiten, Daten auf Seite 1 und 4, Seiten 2–3 ohne Treffer",
    needles: [PERSON.name, PERSON.iban, PERSON.phone, "Klaus Becker"],
    async build() {
      const { doc, font } = await newDoc();
      writeLines(doc.addPage([595, 842]), font, [`Sehr geehrter Herr ${PERSON.name},`, `Ihre IBAN: ${PERSON.iban}`, `Telefon: ${PERSON.phone}`]);
      writeLines(doc.addPage([595, 842]), font, ["Allgemeine Geschaeftsbedingungen"], { filler: 14 });
      writeLines(doc.addPage([595, 842]), font, ["Anhang: Leistungsbeschreibung"], { filler: 14 });
      writeLines(doc.addPage([595, 842]), font, ["Mit freundlichen Gruessen", "Herr Klaus Becker", "Sachbearbeitung"]);
      return doc.save();
    }
  },
  {
    file: "04_gedrehte_seiten.pdf",
    title: "Seiten mit /Rotate 90 und 270 (Text + Formularfeld)",
    needles: [PERSON.name, PERSON.email, PERSON.iban, "Erika Musterfrau"],
    ocrControl: [PERSON.name, "Erika Musterfrau"],
    async build() {
      const { doc, font } = await newDoc();
      const p1 = doc.addPage([595, 842]);
      p1.setRotation(degrees(90));
      writeLines(p1, font, [`Kunde: Herr ${PERSON.name}`, `E-Mail: ${PERSON.email}`]);
      const p2 = doc.addPage([595, 842]);
      p2.setRotation(degrees(270));
      writeLines(p2, font, [`IBAN: ${PERSON.iban}`]);
      const f = doc.getForm().createTextField("kontoinhaber");
      f.setText("Erika Musterfrau");
      f.addToPage(p2, { x: 50, y: 300, width: 220, height: 20, font });
      return doc.save();
    }
  },
  {
    file: "05_scan_nur_bild.pdf",
    title: "Gescannte Seite (nur Bild, kein Textlayer) → OCR",
    needles: ["Mustermann", "max.mustermann@example.com"],
    ocrControl: ["Mustermann", "max.mustermann@example.com"],
    async build({ scanPng }) {
      const { doc } = await newDoc();
      const img = await doc.embedPng(scanPng);
      const p = doc.addPage([595, 842]);
      p.drawImage(img, { x: 0, y: 0, width: 595, height: 842 });
      return doc.save();
    }
  },
  {
    file: "06_metadaten_xmp.pdf",
    title: "Info-Dictionary und XMP-Metadaten mit Personendaten",
    needles: [PERSON.name, "Gehaltsabrechnung Mustermann", "mustermann-hr"],
    async build() {
      const { doc, font } = await newDoc();
      doc.setAuthor(PERSON.name);
      doc.setTitle("Gehaltsabrechnung Mustermann");
      doc.setSubject("Personalakte " + PERSON.name);
      doc.setKeywords(["mustermann-hr"]);
      const xmp = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/">` +
        `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" ` +
        `xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator><rdf:Seq><rdf:li>${PERSON.name}</rdf:li></rdf:Seq>` +
        `</dc:creator><dc:description>mustermann-hr</dc:description></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
      doc.catalog.set(PDFName.of("Metadata"), doc.context.register(doc.context.stream(xmp, { Type: "Metadata", Subtype: "XML" })));
      writeLines(doc.addPage([595, 842]), font, [`Abrechnung fuer Herrn ${PERSON.name}`, `Steuer-ID: ${PERSON.taxId}`]);
      return doc.save();
    }
  },
  {
    file: "07_anhaenge.pdf",
    title: "Eingebettete Dateien (Unicode-Dateiname) und Seite ohne Treffer",
    needles: ["Lohnabrechnung_Jürgen_Weiß", "Geheime Anlage Max Mustermann", PERSON.iban],
    async build() {
      const { doc, font } = await newDoc();
      writeLines(doc.addPage([595, 842]), font, ["Begleitschreiben ohne personenbezogene Angaben"], { filler: 14 });
      await doc.attach(Buffer.from("Geheime Anlage Max Mustermann, IBAN " + PERSON.iban), "Lohnabrechnung_Jürgen_Weiß.txt", { mimeType: "text/plain" });
      return doc.save();
    }
  },
  {
    file: "08_Ünïcødé_Ärztebrief_Øresund.pdf",
    title: "Unicode: Namen mit Umlauten/ß (erkannt) und mit anderen Diakritika (bekannte Lücke), Unicode-Dateiname",
    needles: ["Jürgen Weiß", "Björn Größer", PERSON.birth],
    knownGaps: ["José García", "François Lefèvre"],
    async build() {
      const { doc, font } = await newDoc();
      writeLines(doc.addPage([595, 842]), font, [
        "Arztbrief",
        "Patient: Herr Jürgen Weiß, geboren am " + PERSON.birth,
        "Ueberweisung durch Herrn Dr. Björn Größer",
        "Mitbehandlung: Frau José García",
        "Konsil: Herr François Lefèvre"
      ]);
      return doc.save();
    }
  }
];

module.exports = { cases, PERSON };
