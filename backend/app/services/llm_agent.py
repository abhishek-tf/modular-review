import os
import json
from typing import List
from dotenv import load_dotenv
from groq import Groq
from app.schemas.domain import ExtractedPaper, Component

load_dotenv()

# Initialize Groq Client
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

SYSTEM_PROMPT = """
You are an expert academic journal editor. Your job is to take the extracted text of an academic paper and decompose it into distinct, independently reviewable components (e.g., Methodology, Literature Review, Statistical Analysis, Results Interpretation).

You must output a valid JSON object with a single root key called "components", which contains an array of objects.
Each object in the array must strictly match this schema:
{
  "components": [
    {
      "name": "Component Title (e.g., Statistical Analysis)",
      "description": "One paragraph explaining exactly what this component contains.",
      "source_sections": ["List of section names this draws from"],
      "source_pages": [Array of integer page numbers this text appears on],
      "text_anchor_start": "The exact first 7-10 words of this component from the text",
      "text_anchor_end": "The exact last 7-10 words of this component from the text",
      "expertise_tags": ["Tag1", "Tag2", "Tag3"],
      "estimated_time_minutes": integer (15, 30, 45, or 60),
      "complexity_score": integer (1 to 5, 5 being highly technical like math/methods),
      "review_questions": ["4 to 6 specific questions the reviewer must answer about this component"]
    }
  ]
}

Rules for Anchors:
The `text_anchor_start` and `text_anchor_end` MUST be exact, verbatim substrings copied directly from the provided text.
"""

def decompose_paper(extracted_data: ExtractedPaper, raw_text: str = "") -> List[Component]:
    # 1. Determine what to feed the AI
    if extracted_data.needs_ai_segmentation:
        payload_text = f"The paper lacks clear formatting. Here is the raw text mapped by page. Segment and decompose it:\n\n{raw_text[:20000]}"
    else:
        # Pass the structured sections WITH their page numbers
        sections_str = "\n".join([f"SECTION: {s.heading} (Pages: {s.pages})\n{s.content}" for s in extracted_data.sections])
        payload_text = f"Here are the structured sections of the paper:\n\n{sections_str[:20000]}"

    try:
        # 2. Call Llama 3.3 via Groq
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": payload_text}
            ],
            temperature=0.2,
            max_tokens=4000,
            response_format={"type": "json_object"} # Forces strictly valid JSON
        )
        
        # 3. Parse the JSON response
        response_text = response.choices[0].message.content
        data = json.loads(response_text)
        
        # 4. Validate against our Pydantic model
        components = [Component(**comp) for comp in data.get("components", [])]
        return components

    except Exception as e:
        print(f"Groq API Error: {str(e)}")
        raise e
    
    

def generate_editorial_report(reviews_data: list) -> dict:
    """Takes all structured reviews and generates a 4-part consensus report."""
    
    # Format the review data for the prompt
    formatted_reviews = json.dumps(reviews_data, indent=2)

    prompt = f"""
    You are an expert academic Editor-in-Chief. You have received multiple component-level reviews for a single manuscript.
    
    Review Data:
    {formatted_reviews}
    
    Analyze the submitted reviews and generate a consolidated editorial report in strict JSON format.
    You must objectively synthesize the reviews, citing specific reviewer observations (e.g., "Reviewer A noted that...").
    
    Return ONLY a JSON object with this exact structure:
    {{
      "consensus_strengths": "What reviewers agreed was done well.",
      "consensus_concerns": "What reviewers agreed needs addressing.",
      "conflicting_opinions": "Where reviewers disagreed. Present both sides neutrally. If none, write 'No major conflicts'.",
      "recommended_decision": "Choose one: Accept, Minor Revision, Major Revision, Reject",
      "decision_reasoning": "Specific reasoning drawn directly from the reviews."
    }}
    """
    
    # Assuming you still have the `client` initialized in this file from Phase 1
    response = client.chat.completions.create(
        messages=[{"role": "user", "content": prompt}],
        model="llama-3.3-70b-versatile",
        response_format={"type": "json_object"},
        temperature=0.2 # Low temperature for analytical consistency
    )
    
    return json.loads(response.choices[0].message.content)