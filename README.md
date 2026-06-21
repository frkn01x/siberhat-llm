# 🎩 SiberHat — Pentest AI Chatbot

Llama 3.2 3B tabanlı, pentest veri setiyle fine-tune edilmiş LoRA adapter kullanan siber güvenlik asistanı. React frontend, Node.js backend ve Python FastAPI inference servisinden oluşur.

---

## Mimari

```
Kullanıcı (Tarayıcı)
      │
      ▼
React Frontend  (port 3000)
      │  fetch SSE stream
      ▼
Node.js / Express Backend  (port 3001)
      │  axios stream proxy + SQLite sohbet geçmişi
      ▼
Python FastAPI Inference  (port 8000)
      │
      ▼
Llama 3.2 3B (base) + pentest_model LoRA adapter
```

### Model Detayları

| Özellik | Değer |
|---|---|
| Base Model | `unsloth/Llama-3.2-3B-Instruct` |
| Fine-tuning Yöntemi | LoRA (PEFT) |
| Adapter Boyutu | ~93 MB |
| LoRA Rank | r=16, alpha=16 |
| Eğitim Verisi | `7h3-R3v3n4n7/pentest-agent-dataset-chatml` (322K örnek) |
| Eğitim Süresi | 1000 adım, ~59 dk (Tesla T4) |
| Eğitilen Parametreler | 24.3M / 3.2B (%0.75) |
| Target Modules | q_proj, k_proj, v_proj, o_proj, gate_proj, up_proj, down_proj |

---

## Klasör Yapısı

```
siberhat/
├── pentest_model/                  # Fine-tuned LoRA ağırlıkları
│   ├── adapter_model.safetensors   # Eğitilmiş ağırlıklar (~93MB)
│   ├── adapter_config.json         # LoRA konfigürasyonu
│   ├── tokenizer.json              # Tokenizer
│   ├── tokenizer_config.json
│   ├── chat_template.jinja         # Llama 3.2 chat formatı
│   └── README.md
│
├── inference/                      # Python model servisi
│   ├── main.py                     # FastAPI app, model yükleme, streaming
│   └── requirements.txt
│
├── backend/                        # Node.js API katmanı
│   ├── server.js                   # Express, SSE proxy, session yönetimi
│   ├── db.js                       # SQLite sohbet geçmişi
│   ├── chat.db                     # Otomatik oluşur
│   └── package.json
│
├── frontend/                       # React arayüz
│   ├── src/
│   │   ├── App.jsx                 # Ana bileşen
│   │   ├── App.css                 # Stiller
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
└── eğitim kodları.ipynb            # Model eğitim notebook'u
```

---

## Kurulum ve Çalıştırma

### Gereksinimler

- Python 3.11+
- Node.js 18+
- ~8 GB RAM (CPU ile çalıştırma için)
- GPU varsa çok daha hızlı çalışır (CUDA)

### 1. Inference Servisi (Python)

```bash
cd inference
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

İlk başlatmada model HuggingFace'den indirilir (~6 GB). Sonraki başlatmalarda cache'den yüklenir.

Model hazır olduğunda terminalde şunu görürsün:
```
Model hazır!
INFO: Uvicorn running on http://0.0.0.0:8000
```

Sağlık kontrolü: `http://localhost:8000/health`

### 2. Backend (Node.js)

```bash
cd backend
npm install
npm run dev
```

### 3. Frontend (React)

```bash
cd frontend
npm install
npm run dev
```

Tarayıcıda `http://localhost:3000` aç.

---

## Özellikler

- **Streaming cevaplar** — Token token gelir, timeout sorunu olmaz
- **Sohbet geçmişi** — SQLite ile kalıcı, sol panelde listelenir
- **Konu filtresi** — Siber güvenlik dışı sorular modele gitmeden reddedilir
- **Responsive tasarım** — Mobilde hamburger menü ile sidebar açılır
- **Çoklu oturum** — Birden fazla sohbet başlatılabilir, geçmişe dönülebilir

---

## API Endpointleri

### Backend (port 3001)

| Method | Endpoint | Açıklama |
|---|---|---|
| POST | `/api/chat/stream` | SSE streaming chat |
| GET | `/api/sessions` | Tüm oturumları listele |
| GET | `/api/session/:id` | Oturum geçmişini getir |
| DELETE | `/api/session/:id` | Oturumu sil |

### Inference (port 8000)

| Method | Endpoint | Açıklama |
|---|---|---|
| POST | `/generate/stream` | Token streaming üretim |
| POST | `/generate` | Tam cevap üretim (fallback) |
| GET | `/health` | Servis durumu |

---

## Performans Notları

- **CPU**: Token başına ~1-2 saniye, 256 token için 3-5 dakika
- **GPU (T4)**: Token başına ~0.05 saniye, çok daha hızlı
- `max_new_tokens` değeri `inference/main.py` içinde ayarlanabilir (varsayılan: 256)

---

## Model Eğitimi Hakkında

Eğitim detayları `eğitim kodları.ipynb` dosyasında.

> **Not:** Bu eğitim konsept kanıtlama (proof-of-concept) amaçlıdır. Düşük adım sayısı ve sınırlı parametreler bilinçli olarak seçilmiştir — amacımız modelin davranışını test etmek, production kalitesi elde etmek değil. Bu nedenle aşağıdaki bilgiler yaklaşık değerlerdir, kesin benchmark sonuçları değil.

### Eğitim Özeti

| Parametre | Değer |
|---|---|
| Platform | Google Colab (Tesla T4, 14.5 GB VRAM) |
| Kütüphane | unsloth (2x hızlandırılmış eğitim) |
| Veri Seti | `7h3-R3v3n4n7/pentest-agent-dataset-chatml` |
| Toplam Örnek | 322,511 |
| Görülen Örnek | ~8,000 (toplam verinin ~%0.3'ü) |
| Eğitim Adımı | 1,000 |
| Batch Size | 8 (2 per device × 4 gradient accumulation) |
| Süre | ~59 dakika |
| Başlangıç Loss | ~2.64 |
| Bitiş Loss | ~0.8 civarı |

### Neden Az Parametreyle Eğitildi?

1,000 adım ve veri setinin yalnızca %0.3'ü kullanılarak eğitildi. Bunun nedeni:

- Donanım kısıtı — ücretsiz Colab T4 oturumu sınırlı süre tanır
- Test amaçlı — modelin pentest konularına yönelip yönelmediğini görmek yeterliydi
- LoRA'nın hafifliği — sadece %0.75 parametre eğitildiği için bile küçük adımda etki görülür

Daha kapsamlı eğitim için `max_steps=10000+` ve tam bir epoch (322K örnek) önerilir.

### Cevap Üretim Hiyerarşisi

Bir kullanıcı mesajı geldiğinde sistem şu sırayı izler:

```
1. Konu Filtresi  (inference/main.py)
   │
   ├── Siber güvenlik dışı → anında "Bu konuda yardımcı olamam" döner
   │                          (model hiç çalışmaz, hızlı)
   │
   └── Siber güvenlik ile ilgili → devam eder
           │
           2. Chat Template Uygulanır
           │   Llama 3.2 formatına çevrilir:
           │   <|system|> → <|user|> → <|assistant|>
           │
           3. Tokenizer  (pentest_model/tokenizer.json)
           │   Metin → token ID dizisine dönüştürülür
           │
           4. Base Model  (Llama 3.2 3B)
           │   Her katmanda attention + MLP hesaplar
           │        │
           │   + LoRA Adapter  (pentest_model/adapter_model.safetensors)
           │        Eğitilmiş A ve B matrisleri (A @ B × alpha/r)
           │        base model çıktısına eklenir
           │
           5. Token Sampling
           │   temperature=0.7, top_p=0.9 ile sonraki token seçilir
           │   Bu adım max_new_tokens kadar tekrarlanır
           │
           6. Decode + Stream
               Üretilen token ID'leri metne çevrilir
               SSE ile frontend'e token token gönderilir
```

Kısaca: base model genel dil yeteneğini sağlar, LoRA adapter onu pentest odaklı hale getirir. İkisi birlikte her forward pass'ta çalışır.

Daha iyi sonuç için `max_steps`'i 5000+ yapıp yeniden eğitebilirsin.

---


