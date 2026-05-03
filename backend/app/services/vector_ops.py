import os
from typing import List
from sentence_transformers import SentenceTransformer

# We use the specialized SPECTER2 model through the sentence-transformers wrapper
# This model is optimized for scientific document embedding
# The first run will download the weights automatically.
model = SentenceTransformer('allenai/specter2_base')

async def generate_embedding(text: str) -> List[float]:
    """Generates a 768-dim vector locally using SPECTER2."""
    try:
        # We run the encoding locally. This is MUCH more stable than the HF API.
        # It handles the [SEP] tokens and adapter logic internally.
        embedding = model.encode(text, convert_to_tensor=False)
        
        # Convert the numpy array to a standard Python list for Supabase
        return embedding.tolist()
        
    except Exception as e:
        print(f"Local Embedding Error: {str(e)}")
        raise e