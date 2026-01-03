# 🔒 HTTPS Development Server

Server teraz beží na **HTTPS** aby fungovali notifikácie!

## ✅ Ako otestovať notifikácie

### Variant 1: Localhost (najjednoduchší)

Otvor v prehliadači:
```
https://localhost:5173
```

**Prvýkrát sa zobrazí warning o certifikáte** (je self-signed):
- **Chrome/Edge**: Klikni "Advanced" → "Proceed to localhost (unsafe)"
- **Firefox**: Klikni "Advanced" → "Accept the Risk and Continue"
- **Safari**: Klikni "Show Details" → "visit this website"

To je normálne! Je to development certifikát.

### Variant 2: IP adresa (pre mobilné zariadenia)

Otvor v prehliadači:
```
https://192.168.1.101:5173
```

Musíš akceptovať certifikát (rovnaký postup ako vyššie).

## 🧪 Test notifikácií

1. **Otvor aplikáciu** na https://localhost:5173 alebo https://192.168.1.101:5173
2. **Akceptuj certifikát** (prvýkrát)
3. **Klikni "Začať"** (ak je prvýkrát)
4. **Klikni ⚙️** (Settings)
5. **Klikni "Požiadať o povolenie"**
6. **Teraz by sa malo zobraziť browser dialóg! ✅**
7. Klikni **"Allow"** / **"Povoliť"**
8. Testovacia notifikácia by mala fungovať!

## 🔧 Technické detaily

### Certifikát
- **Umiestnenie**: `.cert/key.pem` a `.cert/cert.pem`
- **Platnosť**: 365 dní
- **Typ**: Self-signed (vhodné pre development)
- **Git**: `.cert/` je v `.gitignore` (nebude commitnutý)

### Server
- **Port**: 5173
- **Host**: `0.0.0.0` (prístupný zo siete)
- **HTTPS**: ✅ Zapnuté
- **Hot Reload**: ✅ Funguje

### Prečo HTTPS?

Notification API je **secure context only**:
- ✅ `https://` - Funguje
- ✅ `http://localhost` - Funguje
- ❌ `http://192.168.1.101` - **NEFUNGUJE**

Prehliadače blokujú notifikácie na HTTP (okrem localhost) z bezpečnostných dôvodov.

## 📱 Mobilné testovanie

### iOS Safari
1. Otvor `https://192.168.1.101:5173`
2. Akceptuj certifikát (klikni "Continue")
3. Požiadaj o notification permission
4. **Dôležité**: Pre PWA notifikácie musíš pridať stránku na Home Screen

### Android Chrome
1. Otvor `https://192.168.1.101:5173`
2. Akceptuj certifikát ("Advanced" → "Proceed")
3. Notification permission by mal fungovať okamžite!

## 🐛 Riešenie problémov

### Certifikát sa nenačíta / Chyba pri štarte servera

```bash
# Pregeneruj certifikát
rm -rf .cert
mkdir .cert
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 365 \
  -keyout .cert/key.pem \
  -out .cert/cert.pem \
  -subj "/CN=localhost"

# Reštartuj dev server
npm run dev
```

### Browser stále hovorí "Not secure"

To je v poriadku! Self-signed certifikáty sa vždy zobrazia ako "Not secure".
Dôležité je, že používaš HTTPS, takže Notification API bude fungovať.

### Permission dialóg sa stále nezobrazuje

1. Skontroluj že používaš `https://` (nie `http://`)
2. Skontroluj Console na chyby
3. Vyskúšaj v inkognito okne (vymaže cache/permissions)
4. Skúsi iný prehliadač

## 🎉 Výsledok

Po akceptovaní certifikátu by mal notification permission dialóg fungovať perfektne!

```
https://localhost:5173 → ⚙️ Settings → Požiadať o povolenie →
Browser dialóg sa zobrazí! ✅
```
