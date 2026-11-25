# Third-Party Licenses & Notices – BlackMyData

BlackMyData is licensed under the MIT License (© 2026 juliandigitalproducts), see [LICENSE](LICENSE).

The full license texts and copyright notices of all components below are in
[`app/static/licenses/`](app/static/licenses/) (`THIRD_PARTY_NOTICES.txt`, `Apache-2.0.txt`, `LICENSE.txt`).
That folder is part of every package: Android APK (assets), Windows setup and portable ZIP, macOS app, Linux tar.gz
and .deb (also as `/usr/share/doc/blackmydata/copyright`) and the web app. In the app it is shown under
"Datenschutz, Architektur & Lizenzen". All components are redistributed unchanged.

---

## 1. Web engine (all packages)

| Component | Version | License | Copyright |
|---|---|---|---|
| PDF.js (`pdf.min.js`, `pdf.worker.min.js`) | 3.11.174 | Apache-2.0 | © 2023 Mozilla Foundation |
| Tesseract.js (`tesseract.min.js`, `worker.min.js`) | 5.1.1 | Apache-2.0 | Jerome Wu, Naptha and contributors |
| ↳ bundled: regenerator-runtime, buffer, zlib.js | – | MIT | Facebook, Inc.; Feross Aboukhadijeh; imaya |
| ↳ bundled: ieee754 | – | BSD-3-Clause | © 2008 Fair Oaks Labs, Inc. |
| tesseract.js-core (`tesseract-core-*.wasm.js`) | 5.x | Apache-2.0 | Tesseract OCR contributors |
| ↳ contains Leptonica | – | BSD-2-Clause-style | © 2001-2020 Leptonica |
| ↳ contains libpng | – | PNG Reference Library License v2 | © 1995-2026 The PNG Reference Library Authors |
| ↳ contains zlib | 1.2.12 | Zlib | © 1995-2022 Jean-loup Gailly and Mark Adler |
| ↳ contains libtiff | – | libtiff license | © 1988-1997 Sam Leffler, © 1991-1997 Silicon Graphics, Inc. |
| Tesseract language data (`deu.traineddata.gz`, `eng.traineddata.gz`, tessdata_fast) | 4.0.0 | Apache-2.0 | Google LLC and Tesseract OCR contributors |
| jsPDF (`jspdf.umd.min.js`) | 2.5.1 | MIT (bundled parts: see `@license` comments in the file) | © 2010-2021 James Hall, 2015-2021 yWorks GmbH |
| pdf-lib (`pdf-lib.min.js`) | 1.17.1 | MIT | © 2019 Andrew Dillon |
| ↳ bundled: @pdf-lib/standard-fonts | 1.0.0 | MIT | © 2018 Andrew Dillon |
| ↳ bundled: @pdf-lib/upng | 1.0.1 | MIT | © 2017 Photopea |
| ↳ bundled: pako | 1.0.11 | MIT AND Zlib | © 2014-2017 Vitaly Puzrin and Andrei Tuputcyn |
| ↳ bundled: tslib | 1.14.1 | 0BSD | © Microsoft Corporation |
| JSZip (`jszip.min.js`) | 3.10.1 | MIT (chosen option of "MIT or GPLv3") | © 2009-2016 Stuart Knightley, David Duponchel, Franz Buchinger, António Afonso |

## 2. Android app only

| Component | License |
|---|---|
| AndroidX appcompat 1.7.1, webkit 1.14.0 and their dependencies (core, activity, fragment, lifecycle, savedstate, emoji2, collection, annotation, profileinstaller, startup, …) | Apache-2.0 |
| Kotlin standard library, kotlinx-coroutines, org.jetbrains:annotations | Apache-2.0 |
| JSpecify, Guava listenablefuture | Apache-2.0 |

## 3. Windows and Linux starter only

| Component | License |
|---|---|
| Go standard library and runtime (statically linked into `BlackMyData.exe` / `BlackMyData`) | BSD-3-Clause, © 2009 The Go Authors |

## 4. Not distributed

* **Local AI bridges (Ollama, LM Studio, oMLX):** BlackMyData's own code (MIT). It talks over HTTP to software the user
  installs separately; that software and its models are not part of BlackMyData.
* **Build and test tools** (Gradle wrapper, playwright-core, JUnit, NSIS) are not shipped in the packages.
