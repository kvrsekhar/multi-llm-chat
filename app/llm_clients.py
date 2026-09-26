"""
LLM Clients Module
Handles communication with OpenAI, Anthropic (Deepseek), and Google Gemini APIs.
Each client function is independent - easy to add or remove models.
"""

import os
import concurrent.futures
from typing import List, Dict, Any

# ─── Model Configuration ────────────────────────────────────────────────────
# Add or remove models from this dict to control which LLMs appear in the UI
AVAILABLE_MODELS = {
    "deepseek": {
        "label": "Deepseek",
        "color": "#D97757",          #  Deepseek orange
        "icon": "🟠",
    },
    "openai": {
        "label": "GPT-4o",
        "color": "#10A37F",          # OpenAI green
        "icon": "🟢",
    },
    "gemini": {
        "label": "Gemini 1.5 Flash",
        "color": "#4285F4",          # Gemini blue
        "icon": "🔵",
    },
}

SYSTEM_PROMPT = (
    "You are a helpful, honest, and concise AI assistant. "
    "Answer clearly and directly. If you don't know something, say so."
)


# ─── Individual Model Callers ─────────────────────────────────────────────────

def call_openai(history: List[Dict], user_message: str) -> str:
    """Call OpenAI ChatCompletion API."""
    try:
        from openai import OpenAI  # pip install openai

        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            return "⚠️  OPENAI_API_KEY not set in .env file."

        client = OpenAI(api_key=api_key)
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        messages.extend(history)
        messages.append({"role": "user", "content": user_message})

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            max_tokens=1024,
            temperature=0.7,
        )
        return response.choices[0].message.content

    except ImportError:
        return "⚠️  openai package not installed. Run: pip install openai"
    except Exception as e:
        return f"❌ OpenAI Error: {str(e)}"


def call_deepseek(history: List[Dict], user_message: str) -> str:
    """Call Anthropic API."""
    try:
        import anthropic  # pip install anthropic
        
        api_key = os.environ.get("DEEPSEEK_API_KEY")
        if not api_key:
            return "⚠️  DEEPSEEK_API_KEY not set in .env file."

        client = anthropic.Anthropic(base_url="https://api.deepseek.com/anthropic",api_key=api_key)
        messages = list(history)  # copy
        messages.append({
            "role": "user", 
            "content":[
                {"type":"text", "text":user_message}
             ]
        })

        response = client.messages.create(
            model="deepseek-flash",
            system=SYSTEM_PROMPT,
            messages=messages,
            max_tokens=1024,
            extra_body={
            "reasoning": {"effort": "none"}  # 'none' completely disables thinking blocks
            }
        )
        text_blocks = [block.text for block in response.content if block.type == "text"]
        final_answer = text_blocks[0] if text_blocks else "No answer text returned"
        
        return final_answer
        
    except ImportError:
        return "⚠️  anthropic package not installed. Run: pip install anthropic"
    except Exception as e:
        return f"❌ Claude Error: {str(e)}"


def call_gemini(history: List[Dict], user_message: str) -> str:
    """Call Google Gemini API."""
    try:
        import google.generativeai as genai  # pip install google-generativeai

        api_key = os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            return "⚠️  GOOGLE_API_KEY not set in .env file."

        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(
            model_name="gemini-2.5-flash",
            system_instruction=SYSTEM_PROMPT,
        )

        # Convert history to Gemini format
        gemini_history = []
        for msg in history:
            role = "user" if msg["role"] == "user" else "model"
            gemini_history.append({"role": role, "parts": [msg["content"]]})

        chat = model.start_chat(history=gemini_history)
        response = chat.send_message(user_message)
        return response.text

    except ImportError:
        return "⚠️  google-generativeai not installed. Run: pip install google-generativeai"
    except Exception as e:
        return f"❌ Gemini Error: {str(e)}"


# ─── Dispatcher ───────────────────────────────────────────────────────────────

MODEL_CALLERS = {
    "openai": call_openai,
    "deepseek": call_deepseek,
    "gemini": call_gemini,
}


def query_all_models(user_message: str) -> Dict[str, Any]:
    """
    Query ALL available models in parallel using ThreadPoolExecutor.
    Returns dict: { model_key: { label, color, icon, answer } }
    """
    results = {}

    def fetch(model_key: str):
        caller = MODEL_CALLERS[model_key]
        answer = caller([], user_message)  # No history for first parallel query
        return model_key, answer

    with concurrent.futures.ThreadPoolExecutor(max_workers=len(MODEL_CALLERS)) as executor:
        futures = {executor.submit(fetch, key): key for key in MODEL_CALLERS}
        for future in concurrent.futures.as_completed(futures):
            model_key, answer = future.result()
            results[model_key] = {
                **AVAILABLE_MODELS[model_key],
                "answer": answer,
            }

    return results


def query_single_model(model_key: str, history: List[Dict], user_message: str) -> str:
    """Query a single model with full conversation history."""
    caller = MODEL_CALLERS.get(model_key)
    if not caller:
        return f"❌ Unknown model: {model_key}"
    return caller(history, user_message)
