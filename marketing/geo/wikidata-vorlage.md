# Wikidata, Schema.org und Knowledge Graph: Vorlagen fuer Alltagsengel

## 1. Wikidata-Eintrag Vorlage

### 1.1 Grundlegende Properties fuer den Wikidata-Eintrag

Ein Wikidata-Eintrag (Item) erhoet die Wahrscheinlichkeit, dass KI-Systeme Alltagsengel als verifizierte Entitaet erkennen und in Antworten verwenden.

**Label und Beschreibungen:**

| Sprache | Label | Beschreibung | Aliase |
|---|---|---|---|
| de | Alltagsengel | Anbieter fuer Alltagsbegleitung nach Paragraph 45a SGB XI in Frankfurt am Main | Alltagsengel Frankfurt, Alltagsengel Alltagsbegleitung |
| en | Alltagsengel | Provider of daily assistance services under German Social Security Code XI in Frankfurt am Main | Alltagsengel Frankfurt |

### 1.2 Properties und Claims

| Property | Wikidata-ID | Wert | Bemerkung |
|---|---|---|---|
| Ist ein(e) (instance of) | P31 | Unternehmen (Q4830453) | Grundlegende Klassifikation |
| Land | P17 | Deutschland (Q183) | |
| Verwaltungseinheit | P131 | Frankfurt am Main (Q1794) | |
| Branche | P452 | Pflegedienstleistung (Q1064858) | Falls vorhanden, sonst "Gesundheitsdienstleistung" |
| Hauptsitz | P159 | Frankfurt am Main (Q1794) | |
| Offizielle Website | P856 | https://alltagsengel.care | |
| E-Mail-Adresse | P968 | info@alltagsengel.care | |
| Postanschrift | P6375 | Neue Mainzer Strasse 66-68, 60311 Frankfurt am Main | |
| Postleitzahl | P281 | 60311 | |
| Koordinaten | P625 | 50.1109 N, 8.6821 E | Koordinaten Neue Mainzer Strasse 66-68 |
| Beschaeftigt sich mit | P101 | Alltagsbegleitung, Betreuung, Entlastungsleistungen | |
| Rechtsform | P1454 | Je nach Rechtsform eintragen | GmbH, UG, Einzelunternehmen etc. |
| Grundungsdatum | P571 | [Gruendungsdatum eintragen] | |
| Dienstleistung | P1056 | Alltagsbegleitung (evtl. neues Item erstellen) | |

### 1.3 Qualifikatoren und Referenzen

Jeder Claim sollte mit Referenzen belegt werden:

- **Referenz-URL (P854):** https://alltagsengel.care/impressum/
- **Abgerufen am (P813):** [Aktuelles Datum]
- **Sprache des Werks (P407):** Deutsch (Q188)

### 1.4 Erstellung Schritt fuer Schritt

1. Konto auf wikidata.org erstellen
2. Neues Item anlegen: "Create new item"
3. Label, Beschreibung und Aliase in Deutsch und Englisch eintragen
4. Statements (Claims) hinzufuegen — mit Referenzen
5. Sitelinks hinzufuegen, sobald ein Wikipedia-Artikel existiert
6. Item veroeffentlichen und Wikidata-ID (Q-Nummer) dokumentieren

**Wichtig:** Wikidata akzeptiert nur verifizierbare Fakten. Marketing-Aussagen gehoeren nicht hierher.

---

## 2. Schema.org JSON-LD Vorlagen

### 2.1 LocalBusiness — Hauptvorlage fuer die Startseite

```json
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "@id": "https://alltagsengel.care/#organization",
  "name": "Alltagsengel",
  "alternateName": "Alltagsengel Alltagsbegleitung",
  "description": "Alltagsengel ist ein nach Paragraph 45a SGB XI anerkannter Anbieter fuer Alltagsbegleitung in Frankfurt am Main. Die Pflegekasse uebernimmt 125 Euro monatlich als Entlastungsbetrag.",
  "url": "https://alltagsengel.care",
  "logo": "https://alltagsengel.care/images/logo.png",
  "image": "https://alltagsengel.care/images/alltagsengel-hero.jpg",
  "email": "info@alltagsengel.care",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Neue Mainzer Strasse 66-68",
    "addressLocality": "Frankfurt am Main",
    "addressRegion": "Hessen",
    "postalCode": "60311",
    "addressCountry": "DE"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": 50.1109,
    "longitude": 8.6821
  },
  "areaServed": [
    {
      "@type": "City",
      "name": "Frankfurt am Main",
      "sameAs": "https://www.wikidata.org/wiki/Q1794"
    },
    {
      "@type": "State",
      "name": "Hessen"
    }
  ],
  "serviceType": [
    "Alltagsbegleitung",
    "Entlastungsleistungen nach Paragraph 45a SGB XI",
    "Seniorenbetreuung",
    "Begleitung im Alltag"
  ],
  "priceRange": "Ab 131 Euro Eigenanteil/Monat (Pflegekasse zahlt 125 Euro)",
  "currenciesAccepted": "EUR",
  "paymentAccepted": "Rechnung, Abtretungserklaerung Pflegekasse",
  "openingHoursSpecification": [
    {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday"
      ],
      "opens": "08:00",
      "closes": "18:00"
    }
  ],
  "sameAs": [
    "https://www.facebook.com/alltagsengel",
    "https://www.instagram.com/alltagsengel",
    "https://www.linkedin.com/company/alltagsengel"
  ],
  "hasOfferCatalog": {
    "@type": "OfferCatalog",
    "name": "Alltagsbegleitung Leistungen",
    "itemListElement": [
      {
        "@type": "Offer",
        "itemOffered": {
          "@type": "Service",
          "name": "Alltagsbegleitung",
          "description": "Professionelle Begleitung im Alltag: Einkaufen, Spaziergaenge, Arztbesuche, Gesellschaft und Unterstuetzung bei der Haushaltsorganisation."
        },
        "price": "256.00",
        "priceCurrency": "EUR",
        "priceSpecification": {
          "@type": "UnitPriceSpecification",
          "price": "256.00",
          "priceCurrency": "EUR",
          "unitText": "Monat",
          "description": "Gesamtkosten 256 Euro/Monat. Pflegekasse zahlt 125 Euro Entlastungsbetrag. Eigenanteil: 131 Euro/Monat."
        }
      }
    ]
  }
}
```

### 2.2 HealthAndBeautyBusiness — Gesundheitsdienstleister-Vorlage

```json
{
  "@context": "https://schema.org",
  "@type": ["HealthAndBeautyBusiness", "LocalBusiness"],
  "@id": "https://alltagsengel.care/#healthbusiness",
  "name": "Alltagsengel",
  "description": "Anerkannter Anbieter fuer Alltagsbegleitung nach Paragraph 45a SGB XI in Frankfurt am Main. Pflegekasse uebernimmt 125 Euro Entlastungsbetrag monatlich.",
  "url": "https://alltagsengel.care",
  "email": "info@alltagsengel.care",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Neue Mainzer Strasse 66-68",
    "addressLocality": "Frankfurt am Main",
    "addressRegion": "Hessen",
    "postalCode": "60311",
    "addressCountry": "DE"
  },
  "medicalSpecialty": "Geriatrics",
  "availableService": {
    "@type": "MedicalTherapy",
    "name": "Alltagsbegleitung",
    "description": "Begleitung und Unterstuetzung pflegebeduerftiger Menschen im Alltag gemaess Paragraph 45a SGB XI. Umfasst Einkaufshilfe, Begleitung zu Terminen, Spaziergaenge und Gesellschaft.",
    "relevantSpecialty": "Geriatrics"
  }
}
```

### 2.3 FAQPage — Vorlage fuer FAQ-Seiten

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Was kostet Alltagsbegleitung bei Alltagsengel in Frankfurt?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Die Alltagsbegleitung bei Alltagsengel kostet 256 Euro pro Monat. Davon uebernimmt die Pflegekasse 125 Euro als Entlastungsbetrag nach Paragraph 45b SGB XI. Der monatliche Eigenanteil betraegt 131 Euro."
      }
    },
    {
      "@type": "Question",
      "name": "Wer hat Anspruch auf den Entlastungsbetrag?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Alle Pflegebeduerftigen mit einem anerkannten Pflegegrad von 1 bis 5 haben Anspruch auf den Entlastungsbetrag in Hoehe von 125 Euro monatlich (1.500 Euro jaehrlich). Der Anspruch besteht ab dem Monat der Pflegegrad-Anerkennung und ist in Paragraph 45b SGB XI geregelt."
      }
    },
    {
      "@type": "Question",
      "name": "Was macht ein Alltagsbegleiter?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Ein Alltagsbegleiter von Alltagsengel unterstuetzt Pflegebeduerftige bei alltaeglichen Aufgaben: Begleitung beim Einkaufen und bei Besorgungen, Spaziergaenge, Begleitung zu Arzt- und Behoerdenterminen, Gesellschaft und Gespraeche, Unterstuetzung bei der Haushaltsorganisation sowie gemeinsames Kochen und Freizeitgestaltung."
      }
    },
    {
      "@type": "Question",
      "name": "Ist Alltagsengel ein zugelassener Anbieter?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Ja, Alltagsengel ist als Angebot zur Unterstuetzung im Alltag nach Paragraph 45a SGB XI in Verbindung mit dem hessischen Landesrecht anerkannt. Die Anerkennung erfolgt durch den Landeswohlfahrtsverband Hessen. Dadurch kann der Entlastungsbetrag direkt mit der Pflegekasse abgerechnet werden."
      }
    },
    {
      "@type": "Question",
      "name": "Muss ich den Entlastungsbetrag selbst beantragen?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Der Entlastungsbetrag muss nicht gesondert beantragt werden. Er steht jedem Pflegebeduerftigen ab Pflegegrad 1 automatisch zu. Alltagsengel rechnet den Entlastungsbetrag ueber eine Abtretungserklaerung direkt mit der Pflegekasse ab. Sie muessen nicht in Vorleistung gehen."
      }
    },
    {
      "@type": "Question",
      "name": "Kann ich den Entlastungsbetrag ansparen?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Ja, nicht genutzte Entlastungsbetraege koennen innerhalb des Kalenderjahres angespart und bis zum 30. Juni des Folgejahres verbraucht werden (Paragraph 45b Absatz 2 SGB XI). Danach verfaellt der Anspruch. Bei 125 Euro monatlich koennen sich bis zu 1.500 Euro jaehrlich ansammeln."
      }
    },
    {
      "@type": "Question",
      "name": "Wie schnell kann Alltagsengel starten?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Nach einem unverbindlichen Erstgespraech kann die Alltagsbegleitung in der Regel innerhalb weniger Tage beginnen. Kontaktieren Sie Alltagsengel unter info@alltagsengel.care oder besuchen Sie alltagsengel.care fuer ein kostenloses Beratungsgespraech."
      }
    },
    {
      "@type": "Question",
      "name": "Was ist der Unterschied zwischen Alltagsbegleitung und Pflegedienst?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Alltagsbegleitung (Paragraph 45a SGB XI) konzentriert sich auf die Begleitung im Alltag: Einkaufen, Spaziergaenge, Arztbesuche und Gesellschaft. Ambulante Pflegedienste (Paragraph 36 SGB XI) leisten dagegen medizinische und koerperbezogene Pflege wie Koerperpflege, Medikamentengabe und Wundversorgung. Beide Leistungen koennen parallel genutzt werden."
      }
    }
  ]
}
```

### 2.4 Service — Vorlage fuer Leistungsseiten

```json
{
  "@context": "https://schema.org",
  "@type": "Service",
  "name": "Alltagsbegleitung Frankfurt",
  "serviceType": "Alltagsbegleitung nach Paragraph 45a SGB XI",
  "description": "Professionelle Alltagsbegleitung fuer Pflegebeduerftige in Frankfurt am Main. Begleitung beim Einkaufen, Spaziergaenge, Arztbesuche, Gesellschaft und Haushaltshilfe. Pflegekasse zahlt 125 Euro Entlastungsbetrag.",
  "provider": {
    "@type": "LocalBusiness",
    "@id": "https://alltagsengel.care/#organization"
  },
  "areaServed": {
    "@type": "City",
    "name": "Frankfurt am Main"
  },
  "audience": {
    "@type": "PeopleAudience",
    "audienceType": "Pflegebeduerftige ab Pflegegrad 1 und deren Angehoerige"
  },
  "hasOfferCatalog": {
    "@type": "OfferCatalog",
    "name": "Leistungen der Alltagsbegleitung",
    "itemListElement": [
      {
        "@type": "OfferCatalog",
        "name": "Begleitung und Mobilitaet",
        "itemListElement": [
          {
            "@type": "Offer",
            "itemOffered": {
              "@type": "Service",
              "name": "Begleitung beim Einkaufen"
            }
          },
          {
            "@type": "Offer",
            "itemOffered": {
              "@type": "Service",
              "name": "Spaziergaenge und Bewegung"
            }
          },
          {
            "@type": "Offer",
            "itemOffered": {
              "@type": "Service",
              "name": "Begleitung zu Arztterminen"
            }
          },
          {
            "@type": "Offer",
            "itemOffered": {
              "@type": "Service",
              "name": "Begleitung zu Behoerdenterminen"
            }
          }
        ]
      },
      {
        "@type": "OfferCatalog",
        "name": "Haushalt und Organisation",
        "itemListElement": [
          {
            "@type": "Offer",
            "itemOffered": {
              "@type": "Service",
              "name": "Unterstuetzung Haushaltsorganisation"
            }
          },
          {
            "@type": "Offer",
            "itemOffered": {
              "@type": "Service",
              "name": "Gemeinsames Kochen"
            }
          },
          {
            "@type": "Offer",
            "itemOffered": {
              "@type": "Service",
              "name": "Hilfe bei Post und Schriftverkehr"
            }
          }
        ]
      },
      {
        "@type": "OfferCatalog",
        "name": "Soziales und Freizeit",
        "itemListElement": [
          {
            "@type": "Offer",
            "itemOffered": {
              "@type": "Service",
              "name": "Gesellschaft und Gespraeche"
            }
          },
          {
            "@type": "Offer",
            "itemOffered": {
              "@type": "Service",
              "name": "Begleitung zu Veranstaltungen"
            }
          },
          {
            "@type": "Offer",
            "itemOffered": {
              "@type": "Service",
              "name": "Gedaechtnistraining"
            }
          }
        ]
      }
    ]
  },
  "offers": {
    "@type": "Offer",
    "price": "256.00",
    "priceCurrency": "EUR",
    "description": "256 Euro Gesamtkosten pro Monat. Davon 125 Euro Entlastungsbetrag (Pflegekasse). Eigenanteil: 131 Euro/Monat.",
    "eligibleRegion": {
      "@type": "City",
      "name": "Frankfurt am Main"
    }
  }
}
```

### 2.5 BreadcrumbList — Vorlage fuer Seitennavigation

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Startseite",
      "item": "https://alltagsengel.care/"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "Leistungen",
      "item": "https://alltagsengel.care/leistungen/"
    },
    {
      "@type": "ListItem",
      "position": 3,
      "name": "Alltagsbegleitung",
      "item": "https://alltagsengel.care/leistungen/alltagsbegleitung/"
    }
  ]
}
```

### 2.6 Organization — Vorlage fuer Impressum/Ueber-uns

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://alltagsengel.care/#organization",
  "name": "Alltagsengel",
  "legalName": "Alltagsengel [Rechtsform eintragen]",
  "url": "https://alltagsengel.care",
  "logo": "https://alltagsengel.care/images/logo.png",
  "email": "info@alltagsengel.care",
  "foundingDate": "[Gruendungsdatum]",
  "foundingLocation": {
    "@type": "Place",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "Frankfurt am Main",
      "addressRegion": "Hessen",
      "addressCountry": "DE"
    }
  },
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Neue Mainzer Strasse 66-68",
    "addressLocality": "Frankfurt am Main",
    "addressRegion": "Hessen",
    "postalCode": "60311",
    "addressCountry": "DE"
  },
  "contactPoint": {
    "@type": "ContactPoint",
    "contactType": "customer service",
    "email": "info@alltagsengel.care",
    "availableLanguage": ["German"],
    "areaServed": {
      "@type": "City",
      "name": "Frankfurt am Main"
    }
  },
  "knowsAbout": [
    "Alltagsbegleitung",
    "Entlastungsbetrag Paragraph 45b SGB XI",
    "Angebote zur Unterstuetzung im Alltag Paragraph 45a SGB XI",
    "Seniorenbetreuung",
    "Pflegebeduerftigkeit"
  ],
  "slogan": "Professionelle Alltagsbegleitung in Frankfurt am Main"
}
```

---

## 3. Google Knowledge Panel Optimierung

### 3.1 Voraussetzungen fuer ein Knowledge Panel

Google erstellt Knowledge Panels basierend auf mehreren Datenquellen. Um ein Panel fuer Alltagsengel zu erhalten, muessen folgende Voraussetzungen erfuellt sein:

| Voraussetzung | Status | Massnahme |
|---|---|---|
| Google Business Profile | Erforderlich | Vollstaendig ausgefuellt und verifiziert |
| Konsistente NAP-Daten | Erforderlich | Identisch in allen Verzeichnissen |
| Schema.org Markup | Empfohlen | LocalBusiness + Organization auf der Website |
| Wikidata-Eintrag | Empfohlen | Item mit korrekten Properties erstellen |
| Wikipedia-Artikel | Optional (aber hilfreich) | Relevanzkriterien pruefen (siehe Abschnitt 5) |
| Vertrauenswuerdige Quellen | Erforderlich | Erwahnungen in Presse, Fachportalen, Verzeichnissen |

### 3.2 Google Business Profile — vollstaendig ausfuellen

**Pflichtfelder:**

| Feld | Inhalt |
|---|---|
| Unternehmensname | Alltagsengel |
| Kategorie (Haupt) | Betreuungsdienst / Home Health Care Service |
| Kategorie (zusaetzlich) | Seniorenbetreuung, Pflegedienst, Sozialdienst |
| Adresse | Neue Mainzer Strasse 66-68, 60311 Frankfurt am Main |
| Telefon | [Geschaeftstelefon] |
| Website | https://alltagsengel.care |
| Oeffnungszeiten | Mo-Fr 08:00-18:00 (oder anpassen) |
| Beschreibung | Alltagsengel bietet professionelle Alltagsbegleitung nach Paragraph 45a SGB XI in Frankfurt am Main. Unsere geschulten Alltagsbegleiter unterstuetzen Pflegebeduerftige bei alltaeglichen Aufgaben wie Einkaufen, Arztbesuchen und Spaziergaengen. Die Pflegekasse uebernimmt 125 Euro monatlich als Entlastungsbetrag. Der Eigenanteil betraegt 131 Euro pro Monat. |

**Optionale aber wichtige Felder:**

| Feld | Inhalt |
|---|---|
| Gruendungsjahr | [Jahr eintragen] |
| Dienstleistungen | Alltagsbegleitung, Einkaufshilfe, Begleitung zu Arztterminen, Spaziergaenge, Gesellschaft, Haushaltshilfe |
| Attribute | Termine verfuegbar, Hausbesuche, Barrierefrei |
| Fotos | Logo, Teamfotos, Buerofotos, Aktivitaetenfotos |
| Beitraege | Regelmaessig (mind. 1x pro Woche) |

### 3.3 Google Business Profile Beitraege — Vorlagen

**Vorlage: Informationsbeitrag**
> Wussten Sie, dass Ihnen als pflegebeduerftiger Mensch ab Pflegegrad 1 monatlich 125 Euro Entlastungsbetrag zustehen? Alltagsengel hilft Ihnen, diesen Betrag sinnvoll zu nutzen — fuer Begleitung beim Einkaufen, Spaziergaenge oder Arztbesuche. Der Eigenanteil betraegt nur 131 Euro pro Monat. Kontaktieren Sie uns fuer ein kostenloses Beratungsgespraech: info@alltagsengel.care

**Vorlage: Angebotsbeitrag**
> Kostenloses Erstgespraech: Erfahren Sie, wie Alltagsengel Sie im Alltag unterstuetzen kann. Wir begleiten Sie beim Einkaufen, zu Arztterminen und bei Spaziergaengen. Die Pflegekasse uebernimmt 125 Euro monatlich. Jetzt Termin vereinbaren unter info@alltagsengel.care.

**Vorlage: Neuigkeiten-Beitrag**
> Nicht vergessen: Nicht genutzte Entlastungsbetraege koennen bis zum 30. Juni des Folgejahres verwendet werden. Danach verfaellt Ihr Anspruch. Kontaktieren Sie Alltagsengel rechtzeitig, damit Ihnen kein Geld verloren geht.

### 3.4 Knowledge-Panel-Verifizierung beantragen

1. Nach Google Business Profile suchen: google.com/search?q=Alltagsengel+Frankfurt
2. Wenn Knowledge Panel erscheint: "Diese Informationen beanspruchen" klicken
3. Verifizierung durchfuehren (per Telefon, E-Mail oder Search Console)
4. Nach Verifizierung: Aenderungsvorschlaege einreichen fuer fehlende/falsche Informationen

---

## 4. Eintraege in Branchenverzeichnisse

### 4.1 Priorisierte Verzeichnisliste

**Prioritaet 1: Pflicht-Verzeichnisse (sofort eintragen)**

| Nr | Verzeichnis | URL | Status | Kostenlos |
|---|---|---|---|---|
| 1 | Google Business Profile | business.google.com | [ ] | Ja |
| 2 | Bing Places | bingplaces.com | [ ] | Ja |
| 3 | Apple Business Connect | businessconnect.apple.com | [ ] | Ja |
| 4 | Pflegelotse (vdek) | pflegelotse.de | [ ] | Ja |
| 5 | Weisse Liste (Bertelsmann) | weisse-liste.de | [ ] | Ja |
| 6 | Gelbe Seiten | gelbeseiten.de | [ ] | Basis ja |
| 7 | Das Oertliche | dasoertliche.de | [ ] | Basis ja |

**Prioritaet 2: Wichtige Verzeichnisse (Woche 1-2)**

| Nr | Verzeichnis | URL | Status | Kostenlos |
|---|---|---|---|---|
| 8 | pflege.de | pflege.de | [ ] | Profil ja |
| 9 | pflegehilfe.org | pflegehilfe.org | [ ] | Anfrage |
| 10 | GoLocal | golocal.de | [ ] | Ja |
| 11 | Yelp | yelp.de | [ ] | Ja |
| 12 | ProvenExpert | provenexpert.com | [ ] | Basis ja |
| 13 | 11880.com | 11880.com | [ ] | Basis ja |
| 14 | Cylex | cylex.de | [ ] | Ja |
| 15 | KennstDuEinen | kennstdueinen.de | [ ] | Ja |

**Prioritaet 3: Ergaenzende Verzeichnisse (Monat 1-2)**

| Nr | Verzeichnis | URL | Status | Kostenlos |
|---|---|---|---|---|
| 16 | Branchenbuch.de | branchenbuch.de | [ ] | Ja |
| 17 | Stadtbranchenbuch | stadtbranchenbuch.com | [ ] | Ja |
| 18 | Hotfrog | hotfrog.de | [ ] | Ja |
| 19 | Firmendb | firmendb.de | [ ] | Ja |
| 20 | Meinungsmeister | meinungsmeister.de | [ ] | Basis ja |

**Prioritaet 4: Branchenspezifische Verzeichnisse (Monat 2-3)**

| Nr | Verzeichnis | URL | Status | Kostenlos |
|---|---|---|---|---|
| 21 | seniorplace.de | seniorplace.de | [ ] | Anfrage |
| 22 | curendo.de | curendo.de | [ ] | Anfrage |
| 23 | betanet.de | betanet.de | [ ] | Anfrage |
| 24 | Wohnen-im-Alter | wohnen-im-alter.de | [ ] | Profil ja |
| 25 | Frankfurt.de Seniorenportal | frankfurt.de | [ ] | Ja |

### 4.2 Einheitlicher Eintrag — Vorlage fuer alle Verzeichnisse

**Unternehmensname:** Alltagsengel

**Kurzbeschreibung (max. 160 Zeichen):**
Alltagsbegleitung in Frankfurt am Main. Pflegekasse zahlt 125 Euro/Monat. Eigenanteil ab 131 Euro. Anerkannt nach Paragraph 45a SGB XI.

**Langbeschreibung (max. 750 Zeichen):**
Alltagsengel bietet professionelle Alltagsbegleitung nach Paragraph 45a SGB XI in Frankfurt am Main. Unsere geschulten Alltagsbegleiter unterstuetzen Pflegebeduerftige bei alltaeglichen Aufgaben: Einkaufen, Spaziergaenge, Arztbesuche, Gesellschaft und Haushaltsorganisation. Die Pflegekasse uebernimmt 125 Euro monatlich als Entlastungsbetrag (Paragraph 45b SGB XI). Der Eigenanteil betraegt 131 Euro pro Monat. Alltagsengel ist als Angebot zur Unterstuetzung im Alltag nach hessischem Landesrecht anerkannt. Kontakt: info@alltagsengel.care

**Kategorie:** Betreuungsdienst / Alltagsbegleitung / Seniorenbetreuung / Haushaltshilfe

**Schlagwoerter:** Alltagsbegleitung, Entlastungsbetrag, Paragraph 45a SGB XI, Seniorenbetreuung, Frankfurt am Main, Pflegegrad, Einkaufshilfe, Arztbegleitung, Alltagshilfe, Betreuung

**Adresse:** Neue Mainzer Strasse 66-68, 60311 Frankfurt am Main

**E-Mail:** info@alltagsengel.care

**Website:** https://alltagsengel.care

**Oeffnungszeiten:** Mo-Fr 08:00-18:00

**Zahlungsarten:** Rechnung, Direktabrechnung mit Pflegekasse

---

## 5. Wikipedia-Relevanzkriterien und Vorbereitung

### 5.1 Relevanzkriterien fuer Unternehmen in der deutschen Wikipedia

Ein Unternehmen ist in der deutschsprachigen Wikipedia relevant, wenn es mindestens eines der folgenden Kriterien erfuellt:

| Kriterium | Erfuellt? | Massnahme |
|---|---|---|
| 1.000+ Mitarbeiter | Wahrscheinlich nein | Wachstum dokumentieren |
| 100 Mio. Euro Umsatz | Wahrscheinlich nein | - |
| 20+ Standorte | Wahrscheinlich nein | Expansion planen |
| Marktfuehrer im Segment | Moeglich | Marktstellung dokumentieren |
| Oeffentliches Interesse/Medienberichterstattung | Aufbaubar | Pressearbeit intensivieren |
| Besondere historische Bedeutung | Nein | - |
| Innovation oder Alleinstellungsmerkmal | Moeglich | Dokumentieren |

### 5.2 Langfristige Vorbereitung fuer Wikipedia-Relevanz

**Phase 1: Quellenlage aufbauen (12-24 Monate)**

Wikipedia verlangt unabhaengige, verlaessliche Quellen. Folgende Medientypen zaehlen:
- Redaktionelle Artikel in Tageszeitungen (Frankfurter Rundschau, FNP, FAZ)
- Beitraege in Fachzeitschriften (Haeusliche Pflege, Altenpflege, Care konkret)
- Erwaehnungen in Buecher oder Fachpublikationen
- Berichte in Radio/TV (hr, HR-Info)
- Artikel auf Nachrichtenportalen (Spiegel, Zeit, Sueddeutsche — unrealistisch kurzfristig)

**Massnahmen:**
1. Pressearbeit systematisieren: 1 Pressemitteilung pro Monat
2. Journalistenkontakte in Frankfurt aufbauen
3. Als Experte fuer Alltagsbegleitung/Entlastungsbetrag positionieren
4. Branchenstudien oder eigene Erhebungen veroeffentlichen
5. Jede Medienerwaenung archivieren (Datum, Medium, Titel, URL)

**Phase 2: Vorbereitungsmaterialien sammeln**

Fuer einen zukuenftigen Wikipedia-Artikel werden benoetigt:
- Mindestens 3-5 unabhaengige Medienquellen
- Gruendungsdaten und Unternehmensgeschichte
- Veroeffentlichte Geschaeftszahlen (optional, aber hilfreich)
- Besondere Auszeichnungen oder Zertifizierungen
- Kooperationen mit oeffentlichen Einrichtungen

### 5.3 Vorformulierter Wikipedia-Entwurf (fuer spaetere Verwendung)

**Hinweis:** Diesen Entwurf NICHT vor Erfuellung der Relevanzkriterien einreichen. Er dient als Vorlage fuer den Zeitpunkt, an dem genuegend unabhaengige Quellen vorliegen.

```
'''Alltagsengel''' ist ein Anbieter fuer [[Alltagsbegleitung]] nach
{{Paragraph|45a|SGB XI}} mit Sitz in [[Frankfurt am Main]].
Das Unternehmen bietet Unterstuetzungsleistungen fuer
[[Pflegebeduerftigkeit|pflegebeduerftige]] Menschen im Alltag an.

== Unternehmen ==
Alltagsengel wurde [Jahr] in Frankfurt am Main gegruendet und ist
als Angebot zur Unterstuetzung im Alltag nach hessischem Landesrecht
anerkannt.<ref>[Quelle Landeswohlfahrtsverband]</ref> Das Unternehmen
bietet Alltagsbegleitung fuer pflegebeduerftige Menschen in Frankfurt
am Main an.

== Leistungen ==
Die Alltagsbegleitung umfasst die Unterstuetzung bei alltaeglichen
Aufgaben wie Einkaufen, Arztbesuche und Spaziergaenge. Die
Leistungen werden ueber den [[Entlastungsbetrag]] nach
{{Paragraph|45b|SGB XI}} finanziert.<ref>[Quelle Fachmedium]</ref>

== Finanzierung ==
Die Kosten werden teilweise durch den [[Entlastungsbetrag]] in
Hoehe von 125 Euro monatlich gedeckt, der Pflegebeduerftigen ab
[[Pflegegrad]] 1 zusteht.<ref>{{Paragraph|45b|SGB XI}}</ref>

== Weblinks ==
* [https://alltagsengel.care/ Offizielle Website]

== Einzelnachweise ==
<references />

[[Kategorie:Unternehmen (Frankfurt am Main)]]
[[Kategorie:Pflege und Betreuung]]
[[Kategorie:Dienstleistungsunternehmen (Deutschland)]]
```

### 5.4 Alternativen zu einem eigenen Wikipedia-Artikel

Falls die Relevanzkriterien (noch) nicht erfuellt sind, gibt es Alternativen:

1. **Erwaenung in bestehenden Artikeln:**
   - Artikel "Alltagsbegleitung" oder "Entlastungsbetrag" in Wikipedia ergaenzen (wenn relevant und quellenbasiert)
   - Artikel "Pflegeleistungen" oder "SGB XI" mit Informationen erweitern

2. **Wikidata-Eintrag (keine Relevanzhuerde):**
   - Wikidata hat niedrigere Relevanzanforderungen als Wikipedia
   - Jedes existierende Unternehmen kann eingetragen werden
   - Wikidata wird von KI-Systemen direkt gelesen

3. **Lokale Wikis:**
   - Frankfurter Stadtwiki oder regionale Wikis haben oft niedrigere Huerden
   - frankfurt-wiki.de oder frankfurt.de koennten Eintraege akzeptieren

---

## 6. Zusammenfassung: Prioritaeten-Matrix

| Massnahme | Aufwand | Wirkung auf KI-Sichtbarkeit | Prioritaet |
|---|---|---|---|
| Google Business Profile | Niedrig | Sehr hoch | Sofort |
| Schema.org JSON-LD | Mittel | Sehr hoch | Sofort |
| NAP-Konsistenz Verzeichnisse | Mittel | Hoch | Woche 1-2 |
| Wikidata-Eintrag | Niedrig | Hoch | Woche 1 |
| FAQ mit Schema.org | Mittel | Sehr hoch | Woche 1-2 |
| Branchenverzeichnisse (25 Stueck) | Hoch | Hoch | Woche 2-8 |
| Pressearbeit | Hoch | Mittel-Hoch | Ab Monat 2 |
| Gastartikel | Hoch | Hoch | Ab Monat 2 |
| Google Knowledge Panel | Niedrig (kommt automatisch) | Sehr hoch | Laufend pruefen |
| Wikipedia-Vorbereitung | Sehr hoch | Sehr hoch (langfristig) | 12-24 Monate |

---

*Dokument erstellt fuer Alltagsengel | alltagsengel.care | Stand: Juli 2026*
*Kontakt: info@alltagsengel.care | Neue Mainzer Strasse 66-68, 60311 Frankfurt am Main*
