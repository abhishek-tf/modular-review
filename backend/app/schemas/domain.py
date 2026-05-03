from pydantic import BaseModel
from typing import List

# --- Phase 1 / Step 2: PDF Extraction Models ---

class Section(BaseModel):
    heading: str
    mapped_type: str  # e.g., 'methodology', 'literature review'
    content: str
    pages: List[int]

class ExtractedPaper(BaseModel):
    paper_id: str
    sections: List[Section]
    needs_ai_segmentation: bool = False


# --- Phase 1 / Step 3: AI Decomposition Models ---

class Component(BaseModel):
    name: str
    description: str
    source_sections: List[str]
    source_pages: List[int]     # The page numbers this component lives on
    text_anchor_start: str      # The exact first 7-10 words of the component
    text_anchor_end: str        # The exact last 7-10 words of the component
    expertise_tags: List[str]
    estimated_time_minutes: int
    complexity_score: int
    review_questions: List[str]

class DecomposedPaper(BaseModel):
    paper_id: str
    components: List[Component]