# Privacy Policy - App-Specific Sections Needed

## ⚠️ IMPORTANT: Permission Changes

**After removing READ_MEDIA_IMAGES/READ_MEDIA_VIDEO permissions**, your privacy policy must reflect that:
- ✅ App uses **Android Photo Picker** (system picker) - no broad photo library access
- ✅ Users **select photos/videos on-demand** (one-time access only)
- ❌ App does **NOT have persistent access** to all photos/videos
- ❌ App does **NOT scan or access** the entire photo library

**This is likely why the privacy policy was rejected** - it may still say the app has broad photo access when it actually uses the system picker.

## Current Template Issues

The privacy policy you have is for a **website**, but you need sections specific to your **mobile app**. Here's what to add/modify:

## Required Additions for Tilda Staff App

### 1. Mobile App Data Collection Section

Add this section:

```
9. Mobile App - Tilda Staff

9.1 Daten, die wir in der App erheben

Wenn Sie die Tilda Staff App verwenden, erheben und verarbeiten wir folgende Daten:

- Kontoinformationen: Name, E-Mail-Adresse, Rolle (Lehrer, Betreuer, etc.)
- Nachrichten: Alle Nachrichten, die Sie in der App senden und empfangen
- Fotos und Videos: Bilder und Videos, die Sie **aktiv auswählen und in Nachrichten anhängen** (über den System-Photo-Picker)
- Kamera-Nutzung: Für QR-Code-Scanning und zum Aufnehmen von Fotos
- Geräteinformationen: Gerätetyp, Betriebssystemversion (für App-Funktionalität)
- Nutzungsdaten: Wann und wie Sie die App verwenden (für Service-Verbesserungen)

**Wichtig**: Die App hat **KEINEN dauerhaften Zugriff** auf Ihre gesamte Fotobibliothek. Fotos und Videos werden nur dann aufgerufen, wenn Sie diese **aktiv auswählen** über den Android Photo Picker (System-Auswahl). Die App scannt oder durchsucht Ihre Fotobibliothek nicht.

9.2 Wie wir Ihre App-Daten verwenden

- Bereitstellung der Messaging-Funktionalität zwischen Mitarbeitern
- Verwaltung von Benutzerkonten und Rollen
- Ermöglichung des Austauschs von Fotos und Videos in Nachrichten (nur die von Ihnen ausgewählten Dateien)
- QR-Code-Scanning für App-Funktionen
- Verbesserung der App-Performance und Fehlerbehebung

**Hinweis zu Fotos/Videos**: Die App verwendet den **Android Photo Picker** (System-Auswahl). Sie haben die volle Kontrolle darüber, welche Fotos/Videos Sie teilen. Die App hat keinen Zugriff auf Ihre gesamte Fotobibliothek.

9.3 Datenspeicherung

Ihre App-Daten werden gespeichert in:
- Supabase (Cloud-Datenbankdienst) - für Nachrichten, Benutzerkonten und App-Daten
- Sichere Server mit Verschlüsselung

9.4 Datenweitergabe in der App

- Ihre Nachrichten und Anhänge sind für andere autorisierte Mitarbeiter in Ihrer Einrichtung sichtbar
- Administratoren haben Zugriff auf alle Daten ihrer Einrichtung
- Wir geben Ihre Daten nicht an Dritte weiter, außer wie in dieser Datenschutzerklärung beschrieben

9.5 Ihre Rechte bezüglich App-Daten

- Sie können jederzeit auf Ihre Daten zugreifen
- Sie können Ihr Konto löschen (Kontaktieren Sie uns)
- Sie können Ihre Nachrichten und Anhänge in der App löschen
- Sie können die App jederzeit deinstallieren
```

### 2. Update Section 4 (Data Collection)

Modify to include app-specific data:

```
4. Datenerfassung auf dieser Website und in der App

4.1 Website-Daten
[Keep existing website cookie/data collection info]

4.2 App-Daten (Tilda Staff App)
- Benutzerkonten und Profile
- Nachrichten und Kommunikationen
- Fotos und Videos (nur wenn Sie diese in Nachrichten anhängen)
- Kamera-Nutzung (nur wenn Sie QR-Codes scannen oder Fotos aufnehmen)
```

### 3. Update Section 6 (eCommerce)

Remove or modify if not applicable:

```
6. eCommerce und Zahlungsanbieter

[Only include if your app has payment features - if not, remove this section]
```

### 4. Update Section 7 (Audio/Video Conferencing)

Modify to reflect app messaging:

```
7. Kommunikation in der App

Die Tilda Staff App ermöglicht die Kommunikation zwischen Mitarbeitern über:
- Textnachrichten
- Fotos und Videos
- Dateianhänge

Diese Daten werden in unserer sicheren Datenbank (Supabase) gespeichert und sind nur für autorisierte Benutzer Ihrer Einrichtung zugänglich.
```

### 5. Add Contact Section for App

```
9. Kontakt für Datenschutzanfragen (App-spezifisch)

Bei Fragen zum Datenschutz in der Tilda Staff App kontaktieren Sie uns:

Optimahl gUG
Robert-Koch-Straße 19
92224 Amberg

E-Mail: [Ihre E-Mail-Adresse]
```

## Complete Structure for App Privacy Policy

Your privacy policy should have these sections:

1. ✅ Datenschutz auf einen Blick (Keep)
2. ✅ Hosting (Keep - but add Supabase mention)
3. ✅ Allgemeine Hinweise (Keep)
4. ⚠️ Datenerfassung (Update - add app section)
5. ⚠️ Analyse-Tools (Keep if using, remove if not)
6. ❓ eCommerce (Remove if not applicable)
7. ⚠️ Kommunikation (Update for app messaging)
8. ✅ Eigene Dienste (Keep if applicable)
9. ➕ **NEW: Mobile App - Tilda Staff** (Add this!)
10. ➕ **NEW: Ihre Rechte** (Add user rights section)
11. ➕ **NEW: Kontakt** (Add contact for app privacy)

## Quick Fix - Add This Section

Add this complete section to your privacy policy:

```
9. Mobile App - Tilda Staff

9.1 Welche Daten erheben wir in der App?

- Kontoinformationen (Name, E-Mail, Rolle)
- Nachrichten und Kommunikationen
- Fotos und Videos (nur wenn von Ihnen hochgeladen)
- Kamera-Nutzung (für QR-Codes und Fotos)
- Geräteinformationen (für App-Funktionalität)

9.2 Warum erheben wir diese Daten?

- Bereitstellung der Messaging-Funktion
- Verwaltung von Benutzerkonten
- Ermöglichung des Austauschs von Medien in Nachrichten
- QR-Code-Scanning
- Verbesserung der App

9.3 Wo werden Daten gespeichert?

- Supabase (Cloud-Datenbank) - verschlüsselt und sicher
- Daten werden in der EU gespeichert

9.4 Wer hat Zugriff?

- Andere autorisierte Mitarbeiter Ihrer Einrichtung
- Administratoren Ihrer Einrichtung
- Wir geben Daten nicht an Dritte weiter

9.5 Ihre Rechte

- Zugriff auf Ihre Daten
- Löschung Ihres Kontos
- Löschung Ihrer Nachrichten
- Widerspruch gegen Datenverarbeitung

9.6 Kontakt

Bei Fragen: [Ihre E-Mail-Adresse]
```

## Important Notes

1. **Remove website-specific sections** if they don't apply (e.g., Google Analytics if not used in app)
2. **Add Supabase** as your data storage provider
3. **Be specific** about what data the app collects
4. **Explain why** you collect each type of data
5. **Mention user rights** clearly
6. **Provide contact information** for privacy inquiries

## Next Steps

1. **Add the app-specific section** (Section 9 above)
2. **Update existing sections** to mention the app
3. **Remove irrelevant sections** (e.g., eCommerce if not applicable)
4. **Add contact email** for privacy inquiries
5. **Host the updated policy** on your website
6. **Add the URL** to Google Play and App Store

