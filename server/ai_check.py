# server/ai_check.py
"""
Check if AI models are available.
In production without models, disable AI endpoints.
"""
import os
from fastapi import HTTPException

def check_ai_available():
    """Check if AI models are available"""
    if os.getenv("DISABLE_AI_MODELS") == "1":
        raise HTTPException(
            503, 
            detail="AI models disabled in this environment. "
                   "For AI features, please run locally or upgrade to a plan that supports larger images."
        )
    return True
