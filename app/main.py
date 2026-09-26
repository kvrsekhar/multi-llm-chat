"""
Multi-LLM Chat App - Main Flask Application
Sends user questions to multiple LLMs in parallel and shows answers side-by-side.
"""

import os
import asyncio
import threading
from flask import Flask, render_template, request, jsonify, session
from dotenv import load_dotenv
from llm_clients import query_all_models, query_single_model

load_dotenv()

app = Flask(__name__, template_folder="../templates", static_folder="../static")
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "dev-secret-key-change-in-prod")


@app.route("/")
def index():
    """Render the main chat interface."""
    return render_template("index.html")


@app.route("/api/ask-all", methods=["POST"])
def ask_all_models():
    """
    Send the user's question to ALL configured LLMs in parallel.
    Returns a dict of { model_name: answer } for the side-by-side panel.
    """
    data = request.get_json()
    user_message = data.get("message", "").strip()

    if not user_message:
        return jsonify({"error": "Message cannot be empty"}), 400

    # Query all models concurrently
    results = query_all_models(user_message)
    return jsonify({"results": results, "user_message": user_message})


@app.route("/api/continue", methods=["POST"])
def continue_with_model():
    """
    Continue a conversation with a single chosen LLM.
    Receives the full conversation history and the new user message.
    """
    data = request.get_json()
    model_key = data.get("model")          # e.g. "deepseek", "openai", "gemini"
    history = data.get("history", [])       # List of {role, content} dicts
    user_message = data.get("message", "").strip()

    if not model_key or not user_message:
        return jsonify({"error": "model and message are required"}), 400

    response = query_single_model(model_key, history, user_message)
    return jsonify({"response": response, "model": model_key})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
