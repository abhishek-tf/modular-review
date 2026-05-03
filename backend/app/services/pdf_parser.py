import fitz  # PyMuPDF
import re
from typing import Dict, Any
from app.schemas.domain import Section, ExtractedPaper

# Our dictionary to normalize wild author headings into standard components
STANDARD_MAPPINGS = {
    "background": "introduction",
    "related work": "literature review",
    "literature": "literature review",
    "methods": "methodology",
    "materials and methods": "methodology",
    "experimental setup": "methodology",
    "findings": "results",
    "concluding remarks": "conclusion",
    "future work": "discussion",
    "references": "references",
    "bibliography": "references"
}

def _map_heading(heading: str) -> str:
    """Cleans numbering (e.g., '1.2 Methods') and maps to standard types."""
    clean_heading = re.sub(r'^\d+(\.\d+)*\s*', '', heading.lower().strip())
    for key, val in STANDARD_MAPPINGS.items():
        if key in clean_heading:
            return val
    return "unknown"

def _is_heading(span: Dict[str, Any], body_font_size: float) -> bool:
    """Heuristic: Is the text larger than body text and relatively short?"""
    size = span.get("size", 0)
    text = span.get("text", "").strip()
    
    # If it's noticeably larger than the standard body text and under 100 chars
    if size > body_font_size + 1.0 and len(text) < 100 and len(text) > 2:
        return True
    return False

def extract_sections(file_path: str, paper_id: str) -> ExtractedPaper:
    doc = fitz.open(file_path)
    
    # Pass 1: Find the dominant font size (body text)
    sizes = {}
    for page in doc:
        blocks = page.get_text("dict")["blocks"]
        for b in blocks:
            if "lines" in b:
                for l in b["lines"]:
                    for s in l["spans"]:
                        sz = round(s["size"])
                        sizes[sz] = sizes.get(sz, 0) + len(s["text"])
                        
    if not sizes:
        doc.close()
        return ExtractedPaper(paper_id=paper_id, sections=[], needs_ai_segmentation=True)
        
    body_font_size = max(sizes, key=sizes.get)
    
    # Pass 2: Extract and group text by headings with Multi-Column Support
    sections = []
    current_heading = "Abstract" # Assume we start at the abstract
    current_content = []
    current_pages = set([1])
    
    for page_num, page in enumerate(doc, start=1):
        # 1. Calculate the geometric midpoint of the page for column sorting
        page_width = page.rect.width
        midpoint = page_width / 2
        
        blocks = page.get_text("dict")["blocks"]
        
        # 2. Geometric Sort: Group by column (left vs right), then sort vertically
        def sort_blocks(block):
            bbox = block.get("bbox", (0, 0, 0, 0))
            x0, y0 = bbox[0], bbox[1]
            
            # If the block starts on the left half, it's column 0. Right half is column 1.
            # In a single-column paper, almost everything falls into column 0.
            column = 0 if x0 < midpoint else 1
            return (column, y0)

        # Apply the sort to the blocks array
        blocks.sort(key=sort_blocks)

        # 3. Read the sorted blocks
        for b in blocks:
            if "lines" in b:
                for l in b["lines"]:
                    for s in l["spans"]:
                        text = s["text"].strip()
                        if not text:
                            continue
                            
                        # Check if this span is a header
                        if _is_heading(s, body_font_size):
                            # Save the previous section
                            if current_content:
                                sections.append(Section(
                                    heading=current_heading,
                                    mapped_type=_map_heading(current_heading),
                                    content=" ".join(current_content),
                                    pages=sorted(list(current_pages))
                                ))
                            # Start new section
                            current_heading = text
                            current_content = []
                            current_pages = set([page_num])
                        else:
                            current_content.append(text)
                            current_pages.add(page_num)
                            
    # Append the final section
    if current_content:
        sections.append(Section(
            heading=current_heading,
            mapped_type=_map_heading(current_heading),
            content=" ".join(current_content),
            pages=sorted(list(current_pages))
        ))
        
    doc.close()
    
    # The Edge Case: Humanities papers or poorly formatted PDFs with < 3 headers
    needs_ai = len(sections) < 3
    
    return ExtractedPaper(
        paper_id=paper_id, 
        sections=sections, 
        needs_ai_segmentation=needs_ai
    )