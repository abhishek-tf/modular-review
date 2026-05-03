import os
import uuid
import json
import fitz  # PyMuPDF
from fastapi import APIRouter, UploadFile, File, HTTPException
from app.services.pdf_parser import extract_sections
from app.services.llm_agent import decompose_paper, client as groq_client
from app.schemas.domain import DecomposedPaper
from supabase import create_client, Client
from app.services.vector_ops import generate_embedding
import jwt
from datetime import datetime, timedelta, timezone
from pydantic import BaseModel
import hmac
import hashlib
from app.services.llm_agent import generate_editorial_report

router = APIRouter()

supabase: Client = create_client(
    os.getenv("SUPABASE_URL"), 
    os.getenv("SUPABASE_KEY")
)

MAX_FILE_SIZE_MB = 20
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

@router.post("/papers/upload")
async def upload_paper(file: UploadFile = File(...)):
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=413, detail=f"File exceeds the {MAX_FILE_SIZE_MB}MB limit.")

    paper_id = str(uuid.uuid4())
    file_path = f"uploads/{paper_id}.pdf"
    
    os.makedirs("uploads", exist_ok=True)
    
    with open(file_path, "wb") as f:
        f.write(file_bytes)

    try:
        doc = fitz.open(file_path)
        total_pages = len(doc)
        
        if total_pages == 0:
            doc.close()
            os.remove(file_path)
            raise HTTPException(status_code=422, detail="The uploaded PDF is empty.")

        total_characters = 0
        for page_num in range(total_pages):
            page = doc.load_page(page_num)
            text = page.get_text("text")
            total_characters += len(text.strip())

        doc.close()

        avg_chars_per_page = total_characters / total_pages
        if avg_chars_per_page < 100:
            os.remove(file_path)
            raise HTTPException(
                status_code=422, 
                detail="This paper appears to be a scanned document. Please upload a text-based PDF."
            )

        # --- NEW: UPLOAD TO SUPABASE STORAGE ---
        storage_path = f"{paper_id}.pdf"
        supabase.storage.from_("papers").upload(
            path=storage_path,
            file=file_bytes,
            file_options={"content-type": "application/pdf"}
        )

        # Get public URL
        public_url = supabase.storage.from_("papers").get_public_url(storage_path)

        # Save record in the papers table
        supabase.table("papers").upsert({
            "id": paper_id, 
            "status": "uploaded",
            "pdf_url": public_url
        }).execute()

    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Storage upload failed: {str(e)}")

    extracted_data = extract_sections(file_path, paper_id)

    return {
        "success": True,
        "paper_id": paper_id,
        "pdf_url": public_url,
        "pages": total_pages,
        "sections_found": len(extracted_data.sections),
        "message": "Paper ingested, saved to cloud storage, and structurally parsed."
    }

import os
import uuid
import fitz  # PyMuPDF
from fastapi import APIRouter, UploadFile, File, HTTPException
from app.services.pdf_parser import extract_sections
from app.services.llm_agent import decompose_paper
from app.schemas.domain import DecomposedPaper
from supabase import create_client, Client
from app.services.vector_ops import generate_embedding
import jwt
from datetime import datetime, timedelta, timezone
from pydantic import BaseModel
import hmac
import hashlib
from app.services.llm_agent import generate_editorial_report

router = APIRouter()

supabase: Client = create_client(
    os.getenv("SUPABASE_URL"), 
    os.getenv("SUPABASE_KEY")
)

MAX_FILE_SIZE_MB = 20
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

@router.post("/papers/upload")
async def upload_paper(file: UploadFile = File(...)):
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=413, detail=f"File exceeds the {MAX_FILE_SIZE_MB}MB limit.")

    paper_id = str(uuid.uuid4())
    file_path = f"uploads/{paper_id}.pdf"
    
    os.makedirs("uploads", exist_ok=True)
    
    with open(file_path, "wb") as f:
        f.write(file_bytes)

    try:
        doc = fitz.open(file_path)
        total_pages = len(doc)
        
        if total_pages == 0:
            doc.close()
            os.remove(file_path)
            raise HTTPException(status_code=422, detail="The uploaded PDF is empty.")

        total_characters = 0
        for page_num in range(total_pages):
            page = doc.load_page(page_num)
            text = page.get_text("text")
            total_characters += len(text.strip())

        doc.close()

        avg_chars_per_page = total_characters / total_pages
        if avg_chars_per_page < 100:
            os.remove(file_path)
            raise HTTPException(
                status_code=422, 
                detail="This paper appears to be a scanned document. Please upload a text-based PDF."
            )

        # --- NEW: UPLOAD TO SUPABASE STORAGE ---
        storage_path = f"{paper_id}.pdf"
        supabase.storage.from_("papers").upload(
            path=storage_path,
            file=file_bytes,
            file_options={"content-type": "application/pdf"}
        )

        # Get public URL
        public_url = supabase.storage.from_("papers").get_public_url(storage_path)

        # Clean up the filename to make it look like a real title
        clean_title = file.filename.replace(".pdf", "").replace("-", " ").replace("_", " ").title()

        # Save record in the papers table
        supabase.table("papers").upsert({
            "id": paper_id, 
            "title": clean_title,
            "status": "uploaded",
            "pdf_url": public_url
        }).execute()

        

    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Storage upload failed: {str(e)}")

    extracted_data = extract_sections(file_path, paper_id)

    return {
        "success": True,
        "paper_id": paper_id,
        "pdf_url": public_url,
        "pages": total_pages,
        "sections_found": len(extracted_data.sections),
        "message": "Paper ingested, saved to cloud storage, and structurally parsed."
    }

@router.post("/papers/{paper_id}/decompose", response_model=DecomposedPaper)
async def trigger_decomposition(paper_id: str):
    # --- THE BULLETPROOF LOCK ---
    # 1. Check the current status in the database
    paper_res = supabase.table("papers").select("status").eq("id", paper_id).execute()
    if not paper_res.data:
        raise HTTPException(status_code=404, detail="Paper not found")
        
    current_status = paper_res.data[0]["status"]
    
    # 2. If already processing (or done), abort the duplicate React call safely!
    if current_status in ["processing", "decomposed"]:
        print(f"🔒 Blocked duplicate decomposition request for {paper_id}")
        existing_comps = supabase.table("components").select("*").eq("paper_id", paper_id).execute()
        return {"paper_id": paper_id, "components": existing_comps.data or []}

    # 3. Lock the paper by marking it 'processing' IMMEDIATELY
    supabase.table("papers").update({"status": "processing"}).eq("id", paper_id).execute()

    # --- REST OF YOUR CODE STARTS HERE ---
    file_path = f"uploads/{paper_id}.pdf"
    
    # If file isn't local, download it from Supabase!
    if not os.path.exists(file_path):
        try:
            os.makedirs("uploads", exist_ok=True)
            pdf_bytes = supabase.storage.from_("papers").download(f"{paper_id}.pdf")
            with open(file_path, "wb") as f:
                f.write(pdf_bytes)
        except Exception as e:
            raise HTTPException(status_code=404, detail="PDF not found locally OR in cloud storage.")

    # --- THE FIX: WIPE OUT ANY DUPLICATES BEFORE STARTING ---
    supabase.table("components").delete().eq("paper_id", paper_id).execute()

    try:
        # 1. Run your actual LLM extraction logic
        extracted_data = extract_sections(file_path, paper_id)
        
        raw_text = ""
        if extracted_data.needs_ai_segmentation:
            doc = fitz.open(file_path)
            raw_text = "\n".join([f"--- PAGE {i+1} ---\n{p.get_text()}" for i, p in enumerate(doc)])
            doc.close()

        # 2. Call Gemini
        components = decompose_paper(extracted_data, raw_text)
        
        # 3. Generate Embeddings & Save to Database
        for comp in components:
            embedding_input = f"{comp.name}: {comp.description} Tags: {', '.join(comp.expertise_tags)}"
            vector = await generate_embedding(embedding_input)
            
            payload = {
                "paper_id": paper_id,
                "name": comp.name,
                "description": comp.description,
                "source_sections": comp.source_sections,
                "source_pages": comp.source_pages,
                "text_anchor_start": comp.text_anchor_start,
                "text_anchor_end": comp.text_anchor_end,
                "expertise_tags": comp.expertise_tags,
                "estimated_time_minutes": comp.estimated_time_minutes,
                "complexity_score": comp.complexity_score,
                "review_questions": comp.review_questions, 
                "embedding": vector
            }
            supabase.table("components").insert(payload).execute()

        supabase.table("papers").update({"status": "decomposed"}).eq("id", paper_id).execute()
        
        return DecomposedPaper(paper_id=paper_id, components=components)

    except Exception as e:
        supabase.table("papers").update({"status": "error"}).eq("id", paper_id).execute()
        print(f"CRITICAL AI ERROR: {str(e)}") 
        raise HTTPException(status_code=500, detail=f"Decomposition failed: {str(e)}")
    

@router.get("/components/{component_id}/match")
async def find_matches_for_component(
    component_id: str, 
    limit: int = 10, 
    threshold: float = 0.4,
    author_institution: str = None # Optional: Pass this to demo the COI filter
):
    try:
        # 1. Fetch the target component's vector
        comp_res = supabase.table("components").select("embedding, name").eq("id", component_id).execute()
        
        if not comp_res.data:
            raise HTTPException(status_code=404, detail="Component not found")
            
        target_embedding = comp_res.data[0]["embedding"]
        component_name = comp_res.data[0]["name"]

        # 2. Execute the Advanced SQL Matchmaker
        matches_res = supabase.rpc(
            "match_researchers_advanced",
            {
                "query_embedding": target_embedding,
                "author_institution": author_institution,
                "match_threshold": threshold,
                "match_count": limit
            }
        ).execute()

        candidates = matches_res.data

        # 3. Candidate Enrichment (Step 9)
        enriched_candidates = []
        for c in candidates:
            # Heuristic Availability: If Activity Score is high, they are likely active.
            # In a real app, this would check their last publication date.
            availability = "Unknown"
            if c["activity_score"] > 80:
                availability = "Highly Active"
            elif c["activity_score"] > 50:
                availability = "Likely Available"

            enriched_candidates.append({
                "researcher_id": c["id"],
                "name": c["name"],
                "institution": c["institution"],
                "availability_estimate": availability,
                "match_reasoning": {
                    "final_score": round(c["final_match_score"] * 100, 1),
                    "vector_similarity": round(c["vector_similarity"] * 100, 1),
                    "activity_score": c["activity_score"]
                },
                "expertise_preview": c["expertise_summary"][:300] + "...", # Truncate for UI
                "openalex_link": f"https://openalex.org/{c['semantic_scholar_id']}"
            })

        # COI Edge Case Warning
        warning_msg = None
        if len(enriched_candidates) < 5:
            warning_msg = "This is a highly specialised component. Remaining candidates may have indirect connections to the authors. Please review manually."

        return {
            "component_id": component_id,
            "component_name": component_name,
            "coi_filter_active": bool(author_institution),
            "warning": warning_msg,
            "candidates": enriched_candidates
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Matchmaking Engine failed: {str(e)}")

    # --- JWT Config ---
# In production, this goes in your .env file!
JWT_SECRET = "super_secret_hackathon_key_2026" 
FRONTEND_URL = "http://localhost:3000" # Where your Next.js app will live

class InviteRequest(BaseModel):
    component_id: str
    researcher_id: str

class AutosaveRequest(BaseModel):
    token: str
    answers: dict
    time_spent_seconds: int

# ==========================================
# STEP 10: INVITATION SYSTEM
# ==========================================

@router.post("/invitations/send")
async def send_invitation(req: InviteRequest):
    try:
        # 1. Generate JWT Token
        expiration = datetime.now(timezone.utc) + timedelta(days=14)
        payload = {
            "component_id": req.component_id,
            "researcher_id": req.researcher_id,
            "exp": expiration
        }
        token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")

        # 2. Save Invitation
        invite_data = {
            "component_id": req.component_id,
            "researcher_id": req.researcher_id,
            "token": token,
            "status": "sent",
            "expires_at": expiration.isoformat()
        }
        supabase.table("invitations").insert(invite_data).execute()
        
        # 3. FORCE PAPER STATUS UPDATE
        comp_res = supabase.table("components").select("paper_id").eq("id", req.component_id).execute()
        if comp_res.data:
            paper_id = comp_res.data[0]["paper_id"]
            # We explicitly set it to 'in_review' here
            supabase.table("papers").update({"status": "in_review"}).eq("id", paper_id).execute()

        magic_link = f"{FRONTEND_URL}/review?token={token}"
        print(f"\n📩 [EMAIL SENT TO RESEARCHER]")
        print(f"Click here to review: {magic_link}\n")

        return {"success": True, "message": "Invitation sent successfully", "link": magic_link}

    except Exception as e:
        print(f"INVITATION ERROR: {str(e)}") # This will print to terminal if it fails
        raise HTTPException(status_code=500, detail=f"Failed to send invite: {str(e)}")

@router.get("/invitations/validate")
async def validate_and_start_review(token: str):
    """Called by the frontend when the researcher clicks the email link."""
    try:
        # 1. Decode & Validate Token
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Invitation link has expired.")
        except jwt.InvalidTokenError:
            raise HTTPException(status_code=401, detail="Invalid invitation link.")

        # 2. Check Database Status
        invite = supabase.table("invitations").select("*").eq("token", token).execute()
        if not invite.data:
            raise HTTPException(status_code=404, detail="Invitation not found.")
            
        inv_data = invite.data[0]
        if inv_data["status"] == "completed":
            raise HTTPException(status_code=400, detail="You have already completed this review.")

        # 3. Update status to 'accepted' if they just opened it
        if inv_data["status"] == "sent":
            supabase.table("invitations").update({"status": "accepted"}).eq("id", inv_data["id"]).execute()
            
            # Create the blank autosave row
            supabase.table("reviews").insert({
                "invitation_id": inv_data["id"],
                "component_id": inv_data["component_id"],
                "researcher_id": inv_data["researcher_id"]
            }).execute()

        # 4. Fetch the Component Data for the Left Panel (Step 11)
        comp = supabase.table("components").select("*").eq("id", inv_data["component_id"]).execute()
        
        # Fetch existing autosave data for the Right Panel (Step 11)
        review = supabase.table("reviews").select("*").eq("invitation_id", inv_data["id"]).execute()

        return {
            "valid": True,
            "researcher_id": inv_data["researcher_id"],
            "component": comp.data[0] if comp.data else None,
            "autosave_data": review.data[0] if review.data else None
        }

    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# STEP 11: AUTOSAVE & SUBMISSION
# ==========================================

@router.patch("/review/autosave")
async def autosave_review(req: AutosaveRequest):
    """Pinged every 30 seconds by the frontend"""
    try:
        # Decode token to prove identity
        payload = jwt.decode(req.token, JWT_SECRET, algorithms=["HS256"])
        
        # Get the review ID
        invite = supabase.table("invitations").select("id").eq("token", req.token).execute()
        if not invite.data:
            raise HTTPException(status_code=404, detail="Invitation not found.")
            
        inv_id = invite.data[0]["id"]

        # Update the JSONB answers column
        supabase.table("reviews").update({
            "answers": req.answers,
            "time_spent_seconds": req.time_spent_seconds,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }).eq("invitation_id", inv_id).execute()

        return {"success": True, "message": "Draft saved"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Autosave failed: {str(e)}")

@router.post("/review/submit")
async def submit_review(req: AutosaveRequest):
    """Called when the user clicks the final Submit button."""
    try:
        payload = jwt.decode(req.token, JWT_SECRET, algorithms=["HS256"])
        
        invite = supabase.table("invitations").select("id").eq("token", req.token).execute()
        inv_id = invite.data[0]["id"]

        # 1. Final save & mark as submitted
        supabase.table("reviews").update({
            "answers": req.answers,
            "time_spent_seconds": req.time_spent_seconds,
            "is_submitted": True,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }).eq("invitation_id", inv_id).execute()

        # 2. Update Invitation status to completed
        supabase.table("invitations").update({"status": "completed"}).eq("id", inv_id).execute()


        return {"success": True, "message": "Review submitted successfully!"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Submission failed: {str(e)}")


   # ==========================================
# STEP 12: AGGREGATION ENGINE
# ==========================================

@router.post("/papers/{paper_id}/report/generate")
async def generate_paper_report(paper_id: str):
    try:
        # 1. Fetch all submitted reviews for this paper
        # We join through components to get reviews linked to this specific paper
        components_res = supabase.table("components").select("id, name").eq("paper_id", paper_id).execute()
        if not components_res.data:
            raise HTTPException(status_code=404, detail="No components found for this paper.")
            
        comp_ids = [c["id"] for c in components_res.data]
        
        reviews_res = supabase.table("reviews").select(
            "id, answers, time_spent_seconds, is_submitted, components(name), researchers(name)"
        ).in_("component_id", comp_ids).eq("is_submitted", True).execute()

        if not reviews_res.data:
            raise HTTPException(status_code=400, detail="Not enough submitted reviews to generate a report.")

        # 2. Format data for the LLM
        clean_reviews = []
        for r in reviews_res.data:
            clean_reviews.append({
                "component_name": r["components"]["name"],
                "reviewer_name": r["researchers"]["name"],
                "answers": r["answers"]
            })

        # 3. Call the LLM Aggregator
        report_json = generate_editorial_report(clean_reviews)

        # 4. Save to Database
        supabase.table("papers").update({
            "status": "review_complete",
            "consolidated_report": report_json,
            "is_report_ai_generated": True
        }).eq("id", paper_id).execute()

        return {
            "success": True,
            "paper_id": paper_id,
            "reviews_analyzed": len(clean_reviews),
            "report": report_json
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Aggregation failed: {str(e)}")


# ==========================================
# STEP 13: CONTRIBUTION RECORDS & ORCID
# ==========================================

# In production, this would be a secure environment variable
HMAC_SECRET = b"taylor_and_francis_verification_key_2026"

@router.post("/review/{review_id}/contribution")
async def generate_contribution_record(review_id: str, sync_orcid: bool = False):
    try:
        # 1. Fetch review and associated metadata
        rev_res = supabase.table("reviews").select(
            "time_spent_seconds, is_submitted, component_id, researcher_id"
        ).eq("id", review_id).execute()
        
        if not rev_res.data or not rev_res.data[0]["is_submitted"]:
            raise HTTPException(status_code=400, detail="Review must be submitted to claim credit.")
            
        review_data = rev_res.data[0]
        comp_res = supabase.table("components").select("paper_id, name").eq("id", review_data["component_id"]).execute()
        paper_id = comp_res.data[0]["paper_id"]

        # 2. Generate the Cryptographic Verification Hash (HMAC)
        # This proves mathematically that T&F verified this review happened.
        verification_payload = f"{review_data['researcher_id']}:{paper_id}:{review_data['time_spent_seconds']}".encode()
        verif_hash = hmac.new(HMAC_SECRET, verification_payload, hashlib.sha256).hexdigest()

        # 3. Create the record
        record_data = {
            "researcher_id": review_data["researcher_id"],
            "paper_id": paper_id,
            "component_id": review_data["component_id"],
            "time_spent_seconds": review_data["time_spent_seconds"],
            "verification_hash": verif_hash,
            "orcid_synced": sync_orcid # Mocked ORCID sync status
        }
        
        rec_res = supabase.table("contribution_records").insert(record_data).execute()

        # 4. Return the verifiable certificate data
        return {
            "success": True,
            "certificate_id": rec_res.data[0]["id"],
            "verification_hash": verif_hash,
            "time_credited_minutes": round(review_data["time_spent_seconds"] / 60, 1),
            "orcid_status": "Synced successfully to ORCID Profile" if sync_orcid else "Pending",
            "message": "Official T&F Contribution Record generated."
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate record: {str(e)}")


@router.get("/papers/{paper_id}/details")
async def get_paper_details(paper_id: str):
    try:
        # 1. Fetch paper metadata
        paper_res = supabase.table("papers").select("*").eq("id", paper_id).execute()
        
        # Print to terminal so we know exactly what Supabase returned
        print(f"DATABASE RESPONSE FOR PAPER: {paper_res.data}")
        
        if not paper_res.data:
            raise HTTPException(status_code=404, detail=f"Paper {paper_id} not found in database.")
            
        paper = paper_res.data[0]

        # 2. Fetch all decomposed components for this paper
        comp_res = supabase.table("components").select("*").eq("paper_id", paper_id).execute()
        
        # 3. Safely grab the PDF url and fallback title
        pdf_url = paper.get("pdf_url", "")
        # Since your DB doesn't have a title column yet, we provide a clean fallback for the UI
        title = paper.get("title", "Manuscript Under Review")

        return {
            "success": True,
            "paper": {
                **paper,
                "title": title
            },
            "components": comp_res.data,
            "pdf_url": pdf_url
        }
    except Exception as e:
        print(f"SERVER ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/papers")
async def get_all_papers():
    try:
        res = supabase.table("papers").select("*").order("created_at", desc=True).execute()
        
        formatted_papers = []
        for p in res.data:
            # Check the EXACT status in the database
            db_status = p.get("status", "uploaded")
            
            # Map it to the UI text the React component is expecting
            if db_status == "uploaded":
                ui_status = "Awaiting Decomposition"
                urgency = "high"
            elif db_status == "processing":
                ui_status = "Awaiting Decomposition" # Edge case if it gets stuck
                urgency = "high"
            elif db_status == "decomposed":
                ui_status = "Reviewer Pending"
                urgency = "high"
            elif db_status == "review_complete":
                ui_status = "Review Complete"
                urgency = "normal"
            else:
                # If it's "in_review" or anything else, set it to "In Review"
                ui_status = "In Review"
                urgency = "normal"

            formatted_papers.append({
                "id": p["id"],
                "title": p.get("title", "Manuscript Under Review"),
                "journal": "Journal of AI Research",
                "submissionDate": p.get("created_at", "").split("T")[0],
                "status": ui_status,
                "urgency": urgency
            })

        return {"success": True, "papers": formatted_papers}
    except Exception as e:
        print(f"GET PAPERS ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/components/{component_id}/match")
async def find_matches_for_component(
    component_id: str, 
    limit: int = 10, 
    threshold: float = 0.4,
    author_institution: str = None # Optional: Pass this to demo the COI filter
):
    try:
        # 1. Fetch the target component's vector
        comp_res = supabase.table("components").select("embedding, name").eq("id", component_id).execute()
        
        if not comp_res.data:
            raise HTTPException(status_code=404, detail="Component not found")
            
        target_embedding = comp_res.data[0]["embedding"]
        component_name = comp_res.data[0]["name"]

        # 2. Execute the Advanced SQL Matchmaker
        matches_res = supabase.rpc(
            "match_researchers_advanced",
            {
                "query_embedding": target_embedding,
                "author_institution": author_institution,
                "match_threshold": threshold,
                "match_count": limit
            }
        ).execute()

        candidates = matches_res.data

        # 3. Candidate Enrichment (Step 9)
        enriched_candidates = []
        for c in candidates:
            # Heuristic Availability: If Activity Score is high, they are likely active.
            # In a real app, this would check their last publication date.
            availability = "Unknown"
            if c["activity_score"] > 80:
                availability = "Highly Active"
            elif c["activity_score"] > 50:
                availability = "Likely Available"

            enriched_candidates.append({
                "researcher_id": c["id"],
                "name": c["name"],
                "institution": c["institution"],
                "availability_estimate": availability,
                "match_reasoning": {
                    "final_score": round(c["final_match_score"] * 100, 1),
                    "vector_similarity": round(c["vector_similarity"] * 100, 1),
                    "activity_score": c["activity_score"]
                },
                "expertise_preview": c["expertise_summary"][:300] + "...", # Truncate for UI
                "openalex_link": f"https://openalex.org/{c['semantic_scholar_id']}"
            })

        # COI Edge Case Warning
        warning_msg = None
        if len(enriched_candidates) < 5:
            warning_msg = "This is a highly specialised component. Remaining candidates may have indirect connections to the authors. Please review manually."

        return {
            "component_id": component_id,
            "component_name": component_name,
            "coi_filter_active": bool(author_institution),
            "warning": warning_msg,
            "candidates": enriched_candidates
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Matchmaking Engine failed: {str(e)}")

    # --- JWT Config ---
# In production, this goes in your .env file!
JWT_SECRET = "super_secret_hackathon_key_2026" 
FRONTEND_URL = "http://localhost:3000" # Where your Next.js app will live

class InviteRequest(BaseModel):
    component_id: str
    researcher_id: str

class AutosaveRequest(BaseModel):
    token: str
    answers: dict
    time_spent_seconds: int

# ==========================================
# STEP 10: INVITATION SYSTEM
# ==========================================

@router.post("/invitations/send")
async def send_invitation(req: InviteRequest):
    try:
        # 1. Generate JWT Token (Expires in 14 days)
        expiration = datetime.now(timezone.utc) + timedelta(days=14)
        payload = {
            "component_id": req.component_id,
            "researcher_id": req.researcher_id,
            "exp": expiration
        }
        token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")

        # 2. Save Invitation to Database
        invite_data = {
            "component_id": req.component_id,
            "researcher_id": req.researcher_id,
            "token": token,
            "status": "sent",
            "expires_at": expiration.isoformat()
        }
        supabase.table("invitations").insert(invite_data).execute()
        
        # --- NEW: UPDATE THE PAPER STATUS ---
        # Fetch the paper_id linked to this specific component
        comp_res = supabase.table("components").select("paper_id").eq("id", req.component_id).execute()
        if comp_res.data:
            paper_id = comp_res.data[0]["paper_id"]
            # Update the paper status to "in_review" so the Dashboard routing updates!
            supabase.table("papers").update({"status": "in_review"}).eq("id", paper_id).execute()

        # 3. MOCK EMAIL SENDING (For Hackathon Speed)
        magic_link = f"{FRONTEND_URL}/review?token={token}"
        print(f"\n📩 [EMAIL SENT TO RESEARCHER]")
        print(f"Click here to review: {magic_link}\n")

        return {"success": True, "message": "Invitation sent successfully", "link": magic_link}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send invite: {str(e)}")

@router.get("/invitations/validate")
async def validate_and_start_review(token: str):
    """Called by the frontend when the researcher clicks the email link."""
    try:
        # 1. Decode & Validate Token
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Invitation link has expired.")
        except jwt.InvalidTokenError:
            raise HTTPException(status_code=401, detail="Invalid invitation link.")

        # 2. Check Database Status
        invite = supabase.table("invitations").select("*").eq("token", token).execute()
        if not invite.data:
            raise HTTPException(status_code=404, detail="Invitation not found.")
            
        inv_data = invite.data[0]
        if inv_data["status"] == "completed":
            raise HTTPException(status_code=400, detail="You have already completed this review.")

        # 3. Update status to 'accepted' if they just opened it
        if inv_data["status"] == "sent":
            supabase.table("invitations").update({"status": "accepted"}).eq("id", inv_data["id"]).execute()
            
            # Create the blank autosave row
            supabase.table("reviews").insert({
                "invitation_id": inv_data["id"],
                "component_id": inv_data["component_id"],
                "researcher_id": inv_data["researcher_id"]
            }).execute()

        # 4. Fetch the Component Data for the Left Panel (Step 11)
        comp = supabase.table("components").select("*").eq("id", inv_data["component_id"]).execute()
        
        # Fetch existing autosave data for the Right Panel (Step 11)
        review = supabase.table("reviews").select("*").eq("invitation_id", inv_data["id"]).execute()

        return {
            "valid": True,
            "researcher_id": inv_data["researcher_id"],
            "component": comp.data[0] if comp.data else None,
            "autosave_data": review.data[0] if review.data else None
        }

    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# STEP 11: AUTOSAVE & SUBMISSION
# ==========================================

@router.patch("/review/autosave")
async def autosave_review(req: AutosaveRequest):
    """Pinged every 30 seconds by the frontend"""
    try:
        # Decode token to prove identity
        payload = jwt.decode(req.token, JWT_SECRET, algorithms=["HS256"])
        
        # Get the review ID
        invite = supabase.table("invitations").select("id").eq("token", req.token).execute()
        if not invite.data:
            raise HTTPException(status_code=404, detail="Invitation not found.")
            
        inv_id = invite.data[0]["id"]

        # Update the JSONB answers column
        supabase.table("reviews").update({
            "answers": req.answers,
            "time_spent_seconds": req.time_spent_seconds,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }).eq("invitation_id", inv_id).execute()

        return {"success": True, "message": "Draft saved"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Autosave failed: {str(e)}")

@router.post("/review/submit")
async def submit_review(req: AutosaveRequest):
    """Called when the user clicks the final Submit button."""
    try:
        payload = jwt.decode(req.token, JWT_SECRET, algorithms=["HS256"])
        
        invite = supabase.table("invitations").select("id").eq("token", req.token).execute()
        inv_id = invite.data[0]["id"]

        # 1. Final save & mark as submitted
        supabase.table("reviews").update({
            "answers": req.answers,
            "time_spent_seconds": req.time_spent_seconds,
            "is_submitted": True,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }).eq("invitation_id", inv_id).execute()

        # 2. Update Invitation status to completed
        supabase.table("invitations").update({"status": "completed"}).eq("id", inv_id).execute()


        return {"success": True, "message": "Review submitted successfully!"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Submission failed: {str(e)}")


   # ==========================================
# STEP 12: AGGREGATION ENGINE
# ==========================================

@router.post("/papers/{paper_id}/report/generate")
async def generate_paper_report(paper_id: str):
    try:
        # 1. Fetch all submitted reviews for this paper
        # We join through components to get reviews linked to this specific paper
        components_res = supabase.table("components").select("id, name").eq("paper_id", paper_id).execute()
        if not components_res.data:
            raise HTTPException(status_code=404, detail="No components found for this paper.")
            
        comp_ids = [c["id"] for c in components_res.data]
        
        reviews_res = supabase.table("reviews").select(
            "id, answers, time_spent_seconds, is_submitted, components(name), researchers(name)"
        ).in_("component_id", comp_ids).eq("is_submitted", True).execute()

        if not reviews_res.data:
            raise HTTPException(status_code=400, detail="Not enough submitted reviews to generate a report.")

        # 2. Format data for the LLM
        clean_reviews = []
        for r in reviews_res.data:
            clean_reviews.append({
                "component_name": r["components"]["name"],
                "reviewer_name": r["researchers"]["name"],
                "answers": r["answers"]
            })

        # 3. Call the LLM Aggregator
        report_json = generate_editorial_report(clean_reviews)

        # 4. Save to Database
        supabase.table("papers").update({
            "status": "review_complete",
            "consolidated_report": report_json,
            "is_report_ai_generated": True
        }).eq("id", paper_id).execute()

        return {
            "success": True,
            "paper_id": paper_id,
            "reviews_analyzed": len(clean_reviews),
            "report": report_json
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Aggregation failed: {str(e)}")


# ==========================================
# STEP 13: CONTRIBUTION RECORDS & ORCID
# ==========================================

# In production, this would be a secure environment variable
HMAC_SECRET = b"taylor_and_francis_verification_key_2026"

@router.post("/review/{review_id}/contribution")
async def generate_contribution_record(review_id: str, sync_orcid: bool = False):
    try:
        # 1. Fetch review and associated metadata
        rev_res = supabase.table("reviews").select(
            "time_spent_seconds, is_submitted, component_id, researcher_id"
        ).eq("id", review_id).execute()
        
        if not rev_res.data or not rev_res.data[0]["is_submitted"]:
            raise HTTPException(status_code=400, detail="Review must be submitted to claim credit.")
            
        review_data = rev_res.data[0]
        comp_res = supabase.table("components").select("paper_id, name").eq("id", review_data["component_id"]).execute()
        paper_id = comp_res.data[0]["paper_id"]

        # 2. Generate the Cryptographic Verification Hash (HMAC)
        # This proves mathematically that T&F verified this review happened.
        verification_payload = f"{review_data['researcher_id']}:{paper_id}:{review_data['time_spent_seconds']}".encode()
        verif_hash = hmac.new(HMAC_SECRET, verification_payload, hashlib.sha256).hexdigest()

        # 3. Create the record
        record_data = {
            "researcher_id": review_data["researcher_id"],
            "paper_id": paper_id,
            "component_id": review_data["component_id"],
            "time_spent_seconds": review_data["time_spent_seconds"],
            "verification_hash": verif_hash,
            "orcid_synced": sync_orcid # Mocked ORCID sync status
        }
        
        rec_res = supabase.table("contribution_records").insert(record_data).execute()

        # 4. Return the verifiable certificate data
        return {
            "success": True,
            "certificate_id": rec_res.data[0]["id"],
            "verification_hash": verif_hash,
            "time_credited_minutes": round(review_data["time_spent_seconds"] / 60, 1),
            "orcid_status": "Synced successfully to ORCID Profile" if sync_orcid else "Pending",
            "message": "Official T&F Contribution Record generated."
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate record: {str(e)}")


@router.get("/papers/{paper_id}/details")
async def get_paper_details(paper_id: str):
    try:
        # 1. Fetch paper metadata
        paper_res = supabase.table("papers").select("*").eq("id", paper_id).execute()
        
        # Print to terminal so we know exactly what Supabase returned
        print(f"DATABASE RESPONSE FOR PAPER: {paper_res.data}")
        
        if not paper_res.data:
            raise HTTPException(status_code=404, detail=f"Paper {paper_id} not found in database.")
            
        paper = paper_res.data[0]

        # 2. Fetch all decomposed components for this paper
        comp_res = supabase.table("components").select("*").eq("paper_id", paper_id).execute()
        
        # 3. Safely grab the PDF url and fallback title
        pdf_url = paper.get("pdf_url", "")
        # Since your DB doesn't have a title column yet, we provide a clean fallback for the UI
        title = paper.get("title", "Manuscript Under Review")

        return {
            "success": True,
            "paper": {
                **paper,
                "title": title
            },
            "components": comp_res.data,
            "pdf_url": pdf_url
        }
    except Exception as e:
        print(f"SERVER ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/papers")
async def get_all_papers():
    try:
        # Fetch all papers, ordering by newest first
        res = supabase.table("papers").select("*").order("created_at", desc=True).execute()
        
        formatted_papers = []
        for p in res.data:
            # Map database fields to the UI's expected format
            formatted_papers.append({
                "id": p["id"],
                "title": p.get("title", "Manuscript Under Review"), # Fallback if title is missing
                "journal": "Journal of AI Research", # Default journal for the demo
                "submissionDate": p.get("created_at", "").split("T")[0], # Formats to YYYY-MM-DD
                "status": "Awaiting Decomposition" if p.get("status") == "uploaded" else "Reviewer Pending",
                "urgency": "high" if p.get("status") == "uploaded" else "normal"
            })

        return {"success": True, "papers": formatted_papers}
    except Exception as e:
        print(f"SERVER ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

    
@router.get("/papers/{paper_id}/track")
async def track_paper_progress(paper_id: str):
    try:
        # 1. Fetch paper metadata
        paper_res = supabase.table("papers").select("*").eq("id", paper_id).execute()
        if not paper_res.data:
            raise HTTPException(status_code=404, detail="Paper not found")
        paper = paper_res.data[0]

        # 2. Fetch components
        comp_res = supabase.table("components").select("id, name").eq("paper_id", paper_id).execute()
        components = comp_res.data
        comp_ids = [c["id"] for c in components]

        # 3. Fetch BOTH invitations AND reviews
        invitations = []
        reviews = []
        if comp_ids:
            invites_res = supabase.table("invitations").select("*").in_("component_id", comp_ids).execute()
            invitations = invites_res.data
            
            # THE FIX: Fetch the actual answers from the reviews table!
            reviews_res = supabase.table("reviews").select("*").in_("component_id", comp_ids).execute()
            reviews = reviews_res.data

        tracking_data = []
        completed_reviews = 0

        for comp in components:
            comp_invites = [i for i in invitations if i["component_id"] == comp["id"]]
            
            comp_status = "Pending Assignment"
            if comp_invites:
                if any(i["status"] == "completed" for i in comp_invites):
                    comp_status = "Completed"
                    completed_reviews += 1
                elif any(i["status"] == "accepted" for i in comp_invites):
                    comp_status = "In Progress"
                else:
                    comp_status = "Invite Sent"

            # THE FIX: Merge the review answers into the invite payload for the frontend
            for inv in comp_invites:
                # Find the matching review for this specific invite
                matching_review = next((r for r in reviews if r.get("invitation_id") == inv["id"] or r.get("researcher_id") == inv.get("researcher_id")), None)
                if matching_review:
                    inv["answers"] = matching_review.get("answers")
                    inv["time_spent_seconds"] = matching_review.get("time_spent_seconds")

            tracking_data.append({
                "id": comp["id"],
                "name": comp["name"],
                "status": comp_status,
                "invites": comp_invites
            })

        return {
            "success": True, 
            "paper": paper, 
            "components": tracking_data,
            "ready_for_report": completed_reviews > 0 
        }
    except Exception as e:
        print(f"TRACKING ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    
@router.post("/papers/{paper_id}/report/generate")
async def generate_consolidated_report(paper_id: str):
    try:
        # 1. Fetch paper and components
        paper_res = supabase.table("papers").select("*").eq("id", paper_id).execute()
        if not paper_res.data:
            raise HTTPException(status_code=404, detail="Paper not found")
        paper_title = paper_res.data[0].get("title", "Unknown Manuscript")

        comp_res = supabase.table("components").select("id, name").eq("paper_id", paper_id).execute()
        components = comp_res.data
        comp_ids = [c["id"] for c in components]

        # 2. THE FIX: Fetch from the 'reviews' table, not 'invitations'
        reviews_res = supabase.table("reviews").select("*").in_("component_id", comp_ids).eq("is_submitted", True).execute()
        completed_reviews = reviews_res.data

        if not completed_reviews:
            raise HTTPException(status_code=400, detail="No completed reviews to synthesize.")

        # 3. Format the data payload for LLaMA safely
        comp_dict = {c["id"]: c["name"] for c in components}
        user_payload = f"Please synthesize the following modular reviews for the manuscript titled '{paper_title}'.\n\n"
        
        for review in completed_reviews:
            comp_name = comp_dict.get(review["component_id"], "Unknown Component")
            
            # Safely parse the Postgres double-escaped string in Python
            raw_answers = review.get("answers", {})
            parsed_answers = {}
            if isinstance(raw_answers, str):
                try:
                    cleaned = raw_answers.strip()
                    if cleaned.startswith('"{') and cleaned.endswith('}"'):
                        cleaned = cleaned[1:-1].replace('""', '"')
                    parsed_answers = json.loads(cleaned)
                    if isinstance(parsed_answers, str):
                        parsed_answers = json.loads(parsed_answers)
                except Exception as e:
                    print("Failed to parse AI prompt JSON:", e)
            else:
                parsed_answers = raw_answers or {}

            user_payload += f"--- Review for Component: {comp_name} ---\n"
            user_payload += f"Methodology: {parsed_answers.get('methodology', raw_answers)}\n"
            user_payload += f"Validity: {parsed_answers.get('validity', 'N/A')}\n"
            user_payload += f"Suggestions: {parsed_answers.get('suggestions', 'N/A')}\n\n"

        # 4. Call Groq with LLaMA 3.1 70B
        completion = groq_client.chat.completions.create(
            model="llama-3.1-70b-versatile",
            messages=[
                {
                    "role": "system",
                    "content": """You are the Chief Editor for a high-impact AI journal. 
                    Based on the provided reviewer feedback, generate a final 'Consolidated Editorial Decision'. 
                    Respond strictly in JSON format with the following keys:
                    "consensus_strengths" (string), "consensus_concerns" (string), 
                    "decision_reasoning" (string), "conflicting_opinions" (string), 
                    "recommended_decision" (string - either "Accept", "Minor Revision", "Major Revision", or "Reject")."""
                },
                {
                    "role": "user",
                    "content": user_payload
                }
            ],
            response_format={"type": "json_object"},
            temperature=0.4
        )
        
        final_report = completion.choices[0].message.content

        # 5. Save report
        supabase.table("papers").update({
            "status": "review_complete",
            "consolidated_report": final_report
        }).eq("id", paper_id).execute()

        return {"success": True, "report": final_report}

    except Exception as e:
        print(f"REPORT GENERATION ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))