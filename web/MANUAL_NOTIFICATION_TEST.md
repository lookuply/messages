# Manuálny test notifikácií

## ✅ Automatický test PREŠIEL

Notification Manager API funguje správne:
- ✅ Notification API podporované
- ✅ Permission checking funguje
- ✅ Nastavenia sa dajú načítať z IndexedDB
- ✅ Predvolené nastavenia sú správne

## 🧪 Kroky na manuálne testovanie

### 1. Otvor aplikáciu v prehliadači

```bash
# Aplikácia už beží na:
http://localhost:5173
```

### 2. Inicializuj identitu (ak je potrebné)

- Klikni na **"Začať"**
- Počkaj na načítanie konverzácií

### 3. Otestuj Settings UI

1. Klikni na ikonu **⚙️** (vpravo hore vedľa "Konverzácie")
2. Mali by si vidieť:
   - ✅ Sekciu "Notifikácie"
   - ✅ Toggle "Povoliť notifikácie"
   - ✅ Status povolenia (Povolené/Zamietnuté/Nepýtané)
   - ✅ Tlačidlo "Požiadať o povolenie" (ak ešte nie je granted)
   - ✅ Toggle "Ukázať náhľad správy"
   - ✅ Sekciu "PWA"
   - ✅ Sekciu "Súkromie"

### 4. Požiadaj o povolenie notifikácií

1. Klikni na **"Požiadať o povolenie"**
2. V browser dialógu klikni **"Allow"** / **"Povoliť"**
3. Status by sa mal zmeniť na "✅ Povolené"
4. Toggle "Povoliť notifikácie" by sa mal automaticky zapnúť

### 5. Testovacia notifikácia

1. Klikni na **"Testovacia notifikácia"**
2. Prepni na iný tab alebo minimalizuj okno
3. Mala by sa zobraziť notifikácia:
   - **Title:** "Test Notification"
   - **Body:** "This is a test notification from Privacy Messaging"
4. Kliknutím na notifikáciu sa vrátiš do aplikácie

### 6. Test s reálnymi správami

#### Príprava:
1. Otvor 2 okná prehliadača:
   - **Okno A** (normálne)
   - **Okno B** (private/inkognito)

#### Test flow:
1. V **Okne A**: Vytvor novú konverzáciu a skopíruj invite link
2. V **Okne B**: Akceptuj invite
3. V **Okne B**: Pošli správu "Test notification message"
4. **Prepni sa na iný tab** (nie Okno A!)
5. V **Okne A** by sa mala zobraziť notifikácia:
   - **Title:** Meno odosielateľa (alebo "Anonymous")
   - **Body:** "Test notification message" (alebo "New message" ak je preview vypnutý)

6. Klikni na notifikáciu → malo by ťa to vrátiť do Okna A a otvoriť konverzáciu

### 7. Test tab visibility

Notifikácie by sa mali zobrazovať **LEN** keď:
- ✅ Tab je v pozadí (nie aktívny)
- ✅ Okno je minimalizované
- ✅ Používateľ je na inom tabe

Notifikácie by sa **NEMALI** zobrazovať keď:
- ❌ Tab je aktívny a fokusovaný
- ❌ Prehliadač je v popredí

### 8. Test nastavení

1. Zapni/vypni toggle "Povoliť notifikácie" → mal by sa uložiť
2. Zapni/vypni "Ukázať náhľad správy"
3. Refresh stránku (F5)
4. Choď späť do Settings
5. Nastavenia by mali byť zachované ✅

### 9. PWA Test (voliteľné)

#### Desktop (Chrome/Edge):
1. V adresnom riadku klikni na ikonu inštalácie (⊕)
2. Klikni "Install"
3. Aplikácia sa otvorí ako samostatné okno
4. Notifikácie by mali fungovať aj v PWA móde

#### Mobile (iOS/Android):
1. **iOS Safari**: Menu → "Add to Home Screen"
2. **Android Chrome**: Menu → "Install app" alebo "Add to Home Screen"
3. Otvor aplikáciu z home screen
4. Notifikácie by mali fungovať (na iOS len ak je pridané na home screen)

## 🔍 Čo sledovať v Dev Console

Otvor Developer Tools (F12) a sleduj Console:

### Pri otvorení Settings:
```
📬 Notification shown: Test Notification
Notification settings saved: {...}
```

### Pri prijatí správy (keď je tab v pozadí):
```
💾 WebSocket message saved to database
📬 Notification shown: [Sender Name]
```

### Service Worker:
```
✅ Service Worker registered: /
[SW] Installing service worker...
[SW] Service Worker activated
```

## ✅ Checklist úspešného testu

- [ ] Settings stránka sa otvorí
- [ ] Permission request funguje
- [ ] Testovacia notifikácia sa zobrazí (keď je tab v pozadí)
- [ ] Reálna správa triggeruje notifikáciu (keď je tab v pozadí)
- [ ] Kliknutie na notifikáciu otvorí konverzáciu
- [ ] Nastavenia sa uložia do IndexedDB
- [ ] Service Worker je zaregistrovaný
- [ ] PWA manifest.json je dostupný
- [ ] Ikony sú dostupné

## 🐛 Ak niečo nefunguje

### Notifikácie sa nezobrazujú:
1. Skontroluj Console na chyby
2. Overte permission status: `Notification.permission` v console
3. Skontroluj či je tab naozaj v pozadí: `document.visibilityState`
4. Skontroluj nastavenia v Settings

### Service Worker problémy:
1. Otvor Application tab v DevTools
2. Choď na Service Workers
3. Skontroluj či je worker Active
4. Skús "Unregister" a refresh

### Ikony sa nenačítavajú:
- Dočasne používame SVG súbory namiesto PNG
- Fungujú v moderných prehliadačoch
- Pre produkciu treba generovať skutočné PNG ikony

## 📊 Výsledky automatického testu

```json
{
  "notificationSupported": true,
  "permissionCheckWorks": true,
  "settingsLoadable": true,
  "permission": "default",
  "settings": {
    "enabled": true,
    "permission": "default",
    "showPreview": true,
    "sound": false
  },
  "canShow": false
}
```

Všetky API funkcie fungujú správne! ✅
