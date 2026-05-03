import os
import sys
import httpx
import asyncio
from dotenv import load_dotenv
from supabase import create_client, Client
from sentence_transformers import SentenceTransformer

# Ensure we can import from the app directory if needed
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

load_dotenv()

# Initialize Supabase
supabase: Client = create_client(
    os.getenv("SUPABASE_URL"), 
    os.getenv("SUPABASE_KEY")
)

# Initialize our Local SPECTER2 Model
print("Loading SPECTER2 Model...")
model = SentenceTransformer('allenai/specter2_base')

SEMANTIC_SCHOLAR_URL = "https://api.semanticscholar.org/graph/v1"

# The 5 domains to ensure a diverse set of experts
DOMAINS = [
    "Artificial Intelligence Neural Networks",
    "Clinical Psychology Therapy",
    "Macroeconomics Monetary Policy",
    "Materials Science Nanotechnology",
    "Sociology Urban Studies"
]

async def fetch_author_ids(query: str, target_count: int = 200) -> set:
    """Finds papers for a topic and extracts author IDs until the target is reached."""
    author_ids = set()
    offset = 0
    
    print(f"\n🔍 Searching for domain: '{query}'...")
    
    async with httpx.AsyncClient() as client:
        while len(author_ids) < target_count:
            search_url = f"{SEMANTIC_SCHOLAR_URL}/paper/search"
            # We fetch 100 papers at a time to grab their authors
            params = {"query": query, "limit": 100, "offset": offset, "fields": "authors"}
            
            try:
                response = await client.get(search_url, params=params, timeout=30.0)
                if response.status_code != 200:
                    print(f"   API Rate Limit or Error. Retrying in 5s...")
                    await asyncio.sleep(5)
                    continue
                    
                papers = response.json().get("data", [])
                if not papers:
                    break # No more papers found
                    
                for paper in papers:
                    for author in paper.get("authors", []):
                        if author.get("authorId"):
                            author_ids.add(author["authorId"])
                            if len(author_ids) >= target_count:
                                break
                    if len(author_ids) >= target_count:
                        break
                        
                offset += 100
                await asyncio.sleep(1) # Be polite to the free API
                
            except Exception as e:
                print(f"   Network error: {e}. Retrying in 5s...")
                await asyncio.sleep(5)
                
    return author_ids

async def process_researcher(author_id: str):
    """Fetches details and builds the vector fingerprint."""
    async with httpx.AsyncClient() as client:
        url = f"{SEMANTIC_SCHOLAR_URL}/author/{author_id}"
        params = {"fields": "name,affiliations,paperCount,citationCount,hIndex,papers.title,papers.abstract"}
        
        try:
            res = await client.get(url, params=params, timeout=10.0)
            if res.status_code != 200:
                return None
                
            data = res.json()
            name = data.get("name")
            if not name:
                return None
                
            affiliations = data.get("affiliations", [])
            institution = affiliations[0] if affiliations else "Independent Researcher"
            
            h_index = data.get("hIndex", 0) or 0
            citations = data.get("citationCount", 0) or 0
            
            # Simple 0-100 normalization
            h_score = min(100, (h_index / 50) * 100)
            cit_score = min(100, (citations / 5000) * 100)
            activity_score = int((h_score * 0.6) + (cit_score * 0.4))
            
            papers = data.get("papers", [])[:10]
            if not papers:
                return None # Skip researchers with no paper data
                
            expertise_text = f"Researcher: {name}. Institution: {institution}. "
            topics = [p.get("title", "") for p in papers if p.get("title")]
            expertise_summary = expertise_text + " Focus areas include: " + " | ".join(topics)
            
            # Vectorize locally
            vector = model.encode(expertise_summary, convert_to_tensor=False).tolist()
            
            return {
                "semantic_scholar_id": author_id,
                "name": name,
                "institution": institution,
                "expertise_summary": expertise_summary[:1500], # Prevent massive text blobs
                "activity_score": max(5, activity_score),
                "embedding": vector
            }
        except Exception:
            return None

async def main():
    print("🚀 Starting the 1K Researcher Seeding Pipeline...")
    master_author_ids = set()
    
    # 1. Harvest IDs across 5 domains (200 each)
    for domain in DOMAINS:
        ids = await fetch_author_ids(domain, target_count=200)
        master_author_ids.update(ids)
        print(f"   ✅ Gathered {len(ids)} IDs for {domain}")
        
    master_list = list(master_author_ids)[:1000] # Ensure exactly 1000
    print(f"\n📊 Total Unique Authors Found: {len(master_list)}")
    
    # 2. Process and Insert in Batches
    batch_size = 50
    current_batch = []
    total_inserted = 0
    
    for i, a_id in enumerate(master_list):
        print(f"[{i+1}/1000] Processing {a_id}...", end="\r")
        
        profile = await process_researcher(a_id)
        if profile:
            current_batch.append(profile)
            
        # Respect rate limits
        await asyncio.sleep(0.5) 
        
        # When batch is full, push to Supabase
        if len(current_batch) >= batch_size or i == len(master_list) - 1:
            if current_batch:
                try:
                    # Upsert to avoid crashing on duplicate semantic_scholar_ids
                    supabase.table("researchers").upsert(current_batch, on_conflict="semantic_scholar_id").execute()
                    total_inserted += len(current_batch)
                    print(f"\n   💾 Inserted batch. Total in DB so far: {total_inserted}")
                    current_batch = []
                except Exception as e:
                    print(f"\n   ❌ Supabase insert failed for batch: {e}")
                    # Clear batch to keep moving
                    current_batch = []

    print(f"\n🎉 Pipeline Complete! Successfully seeded {total_inserted} researchers.")

if __name__ == "__main__":
    asyncio.run(main())