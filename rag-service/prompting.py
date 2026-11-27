from typing import List, Dict, Any

def build_academic_prompt(
    question: str,
    context_chunks: List[Dict[str, Any]],
    history: List[Dict[str, str]] = None
) -> str:
    """
    Constructs a grounded academic prompt with capped context blocks,
    citation formatting instructions, and multi-turn conversation memory.
    """
    context_blocks = []
    # Cap context chunks to top 3-4 and 1200 chars per chunk to prevent prompt bloat and latency
    for c in context_chunks[:4]:
        doc_name = c.get("filename") or c.get("documentId") or "Course Material"
        page = c.get("page")
        page_str = f" (Page {page})" if page else ""
        snippet = c.get("text", "").strip()[:1200]
        context_blocks.append(f"[{doc_name}{page_str}]:\n{snippet}")

    context_str = "\n\n".join(context_blocks) if context_blocks else "No relevant context available in university course documents."

    # Format conversation history
    history_str = ""
    if history and len(history) > 0:
        history_lines = []
        for turn in history[-3:]:
            role = "Student" if turn.get("role") == "user" else "EduQuery AI"
            history_lines.append(f"{role}: {turn.get('content', '').strip()[:300]}")
        history_str = "\nRecent Conversation Context:\n" + "\n".join(history_lines) + "\n"

    prompt = f"""You are EduQuery AI, a rigorous, document-grounded university academic assistant.
Your mission is to provide accurate, pedagogical, and well-structured answers grounded in the official course materials provided below.

Guidelines:
1. Grounding: Answer strictly using the provided course context as your primary source of truth.
2. Academic Rigor: Explain foundational concepts, algorithms, definitions, or trade-offs with clarity.
3. Conciseness: Keep your answer structured and concise (under 250 words unless in-depth mathematical or code expansion is explicitly requested), avoiding unnecessary filler.
4. Formatting: Format cleanly with Markdown:
   - Use headings (###) for sections
   - Use concise bullet points for key properties or steps
   - Use code blocks or mathematical notation where appropriate
5. Transparency: If the context does not contain enough information to fully resolve the query, state what is covered in the notes and what requires further reading.

{history_str}
Course Material Context:
----------------------------------------
{context_str}
----------------------------------------

Student Question: {question}

Academic Answer:"""

    return prompt
