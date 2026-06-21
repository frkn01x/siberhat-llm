from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List
import torch
import json
import os

app = FastAPI(title="SiberHat Inference API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ADAPTER_PATH = os.path.join(BASE_DIR, "pentest_model")
BASE_MODEL = "unsloth/Llama-3.2-3B-Instruct"

model = None
tokenizer = None

# Siber güvenlikle ilgili anahtar kelimeler
CYBER_KEYWORDS = {
    "tr": [
        "pentest", "hack", "exploit", "payload", "zafiyet", "güvenlik", "saldırı",
        "nmap", "metasploit", "burp", "sql", "xss", "injection", "reverse shell",
        "privilege", "escalation", "ctf", "flag", "cipher", "şifre", "kriptografi",
        "network", "firewall", "port", "scan", "recon", "osint", "phishing",
        "malware", "ransomware", "trojan", "backdoor", "rootkit", "vulnerability",
        "cve", "cvss", "owasp", "waf", "ids", "ips", "wireshark", "tcpdump",
        "brute", "force", "wordlist", "hashcat", "john", "hydra", "nikto",
        "dirb", "gobuster", "subdomain", "dns", "http", "https", "ssl", "tls",
        "token", "jwt", "oauth", "csrf", "ssrf", "lfi", "rfi", "rce", "buffer",
        "overflow", "heap", "stack", "rop", "shellcode", "assembly", "binary",
        "reverse", "engineer", "decompile", "obfuscate", "bypass", "sandbox",
        "docker", "kubernetes", "aws", "cloud", "linux", "windows", "server",
        "siber", "sızma", "test", "güvenlik duvarı", "ağ", "protokol",
    ],
}

def is_cybersecurity_related(text: str) -> bool:
    """Mesajın siber güvenlikle alakalı olup olmadığını kontrol et."""
    text_lower = text.lower()
    for keyword in CYBER_KEYWORDS["tr"]:
        if keyword in text_lower:
            return True
    return False

REJECT_RESPONSE = "Bu konuda yardımcı olamam. Yalnızca siber güvenlik, pentest, CTF, network güvenliği ve etik hacking konularında destek veriyorum."


def load_model():
    global model, tokenizer
    from transformers import PreTrainedTokenizerFast, AutoModelForCausalLM, TextIteratorStreamer
    from peft import PeftModel, LoraConfig
    import inspect, tempfile, shutil

    print("Tokenizer yükleniyor...")
    tokenizer = PreTrainedTokenizerFast(
        tokenizer_file=os.path.join(ADAPTER_PATH, "tokenizer.json"),
        bos_token="<|begin_of_text|>",
        eos_token="<|eot_id|>",
        pad_token="<|finetune_right_pad_id|>",
        padding_side="left",
    )
    chat_template_path = os.path.join(ADAPTER_PATH, "chat_template.jinja")
    if os.path.exists(chat_template_path):
        with open(chat_template_path, "r", encoding="utf-8") as f:
            tokenizer.chat_template = f.read()

    print(f"Base model yükleniyor: {BASE_MODEL}")
    base = AutoModelForCausalLM.from_pretrained(
        BASE_MODEL,
        torch_dtype=torch.float32,
        device_map="cpu",
        trust_remote_code=True,
    )

    print("LoRA adapter yükleniyor...")
    config_path = os.path.join(ADAPTER_PATH, "adapter_config.json")
    with open(config_path, "r") as f:
        adapter_cfg = json.load(f)

    valid_keys = set(inspect.signature(LoraConfig.__init__).parameters.keys()) - {"self"}
    cleaned_cfg = {k: v for k, v in adapter_cfg.items() if k in valid_keys}

    tmp_dir = tempfile.mkdtemp()
    shutil.copy(os.path.join(ADAPTER_PATH, "adapter_model.safetensors"),
                os.path.join(tmp_dir, "adapter_model.safetensors"))
    with open(os.path.join(tmp_dir, "adapter_config.json"), "w") as f:
        json.dump(cleaned_cfg, f)

    model = PeftModel.from_pretrained(base, tmp_dir)
    shutil.rmtree(tmp_dir)
    model.eval()
    print("Model hazır!")


@app.on_event("startup")
async def startup():
    load_model()


class Message(BaseModel):
    role: str
    content: str


class GenerateRequest(BaseModel):
    messages: List[Message]
    max_new_tokens: int = 256
    temperature: float = 0.7
    top_p: float = 0.9


@app.post("/generate/stream")
async def generate_stream(req: GenerateRequest):
    if model is None or tokenizer is None:
        raise HTTPException(status_code=503, detail="Model henüz yüklenmedi")

    from transformers import TextIteratorStreamer
    from threading import Thread

    # Son user mesajını al ve konu filtrele
    user_messages = [m for m in req.messages if m.role == "user"]
    if user_messages:
        last_user_msg = user_messages[-1].content
        if not is_cybersecurity_related(last_user_msg):
            def reject_stream():
                yield f"data: {json.dumps({'token': REJECT_RESPONSE})}\n\n"
                yield "data: [DONE]\n\n"
            return StreamingResponse(reject_stream(), media_type="text/event-stream")

    messages = [{"role": m.role, "content": m.content} for m in req.messages]

    input_ids = tokenizer.apply_chat_template(
        messages,
        tokenize=True,
        add_generation_prompt=True,
        return_tensors="pt",
    ).to(model.device)

    streamer = TextIteratorStreamer(tokenizer, skip_prompt=True, skip_special_tokens=True)

    gen_kwargs = dict(
        input_ids=input_ids,
        max_new_tokens=req.max_new_tokens,
        temperature=req.temperature,
        top_p=req.top_p,
        do_sample=True,
        pad_token_id=tokenizer.eos_token_id,
        streamer=streamer,
    )

    # Modeli ayrı thread'de çalıştır
    thread = Thread(target=model.generate, kwargs=gen_kwargs)
    thread.start()

    def event_stream():
        for token in streamer:
            yield f"data: {json.dumps({'token': token})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/generate")
async def generate(req: GenerateRequest):
    """Streaming olmayan fallback endpoint"""
    if model is None or tokenizer is None:
        raise HTTPException(status_code=503, detail="Model henüz yüklenmedi")

    try:
        messages = [{"role": m.role, "content": m.content} for m in req.messages]
        input_ids = tokenizer.apply_chat_template(
            messages, tokenize=True, add_generation_prompt=True, return_tensors="pt"
        ).to(model.device)

        with torch.no_grad():
            output_ids = model.generate(
                input_ids,
                max_new_tokens=req.max_new_tokens,
                temperature=req.temperature,
                top_p=req.top_p,
                do_sample=True,
                pad_token_id=tokenizer.eos_token_id,
            )

        new_tokens = output_ids[0][input_ids.shape[-1]:]
        response = tokenizer.decode(new_tokens, skip_special_tokens=True)
        return {"response": response.strip()}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    return {"status": "ok", "model_loaded": model is not None}
