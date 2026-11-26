import os

import re

import json

import sys

import hashlib

import urllib.request

import urllib.error

from pathlib import Path

import markdown

from bs4 import BeautifulSoup


MEILI_HOST = (os.getenv("MEILI_HOST") or os.getenv("MEILISEARCH_HOST", "http://127.0.0.1:7700")).rstrip("/")

MEILI_KEY = os.getenv("MEILI_KEY") or os.getenv("MEILISEARCH_KEY", "devkey")

INDEX_NAME = os.getenv("MEILI_INDEX") or os.getenv("MEILISEARCH_INDEX", "docs")

MD_IMAGE_RE = re.compile(r'!\[[^\]]*\](?:\([^)]*\)|\[[^\]]*\])?')

def remove_html_elemets(markdown_text):
    html = markdown.markdown(markdown_text, extensions=["tables"])
    soup = BeautifulSoup(html, "html.parser")
    return MD_IMAGE_RE.sub('', soup.get_text())

TOC_API_URL = os.getenv("TOC_API_URL", "http://localhost:3000/api/toc")


def format_md_with_fumadocs(content):
    try:
        url = TOC_API_URL

        data = json.dumps({'payload': content}).encode('utf-8')
        request = urllib.request.Request(url, data=data)
        request.add_header('Content-Type', 'application/json')
        
        with urllib.request.urlopen(request) as response:
            if response.status == 200:
                return json.loads(response.read().decode())
            else:
                print(f"API request failed with status {response.status}")
                sys.exit(1)

    except Exception as e:
        print(f"Failed to get document structure from API: {e}")
        sys.exit(1)


def process_args() -> str:
    match len(sys.argv):
        case 1:
            return Path("./docs").resolve()
        case 2:
            arg = sys.argv[1]
            path = Path(arg).resolve()

            if path.exists():
                return path
            print("Specified folder does not exist: ", arg)
            sys.exit(1)            
        case _:
            print("Too many arguments.")
            sys.exit(1)   
         
def document_slug_and_language(path: Path) -> tuple[str, str]:
    LANGUAGE_SUFFIX_RE = re.compile(r"^(?P<slug>.+)\.(?P<lang>[a-z]{2})$", re.IGNORECASE)
    stem = path.stem
    match = LANGUAGE_SUFFIX_RE.fullmatch(stem)
    if match:
        language = match.group("lang").lower()
        return match.group("slug"), "cz" if language == "cs" else language
    return stem, "en"


def language_from_path(path: Path, source_dir: Path) -> str:
    return document_slug_and_language(path)[1]


def page_key_from_path(path: Path, source_dir: Path) -> str:
    relative = path.relative_to(source_dir)
    slug, language = document_slug_and_language(path)
    segments = list(relative.parts[:-1])
    if slug != "index":
        segments.append(slug)
    key = "/".join(segments)
    if language != "en":
        return f"/{language}/{key}" if key else f"/{language}"
    return f"/{key}" if key else "/"

def create_id(path: Path, source_dir: str, anchor: str | None = None,
counter: int = 0) -> str:
    relativePath = path.relative_to(source_dir).as_posix()
    base = relativePath
    if anchor:
        base = f"{relativePath}-{anchor}"
    id_base = hashlib.sha1(base.encode("utf8")).hexdigest()
    
    if counter == 0:
        return id_base
    
    return f"{id_base}-{counter}"

def http_request(method, url, body=None):
    headers = {
        "Authorization": f"Bearer {MEILI_KEY}",
        "Content-Type": "application/json",
    }
    data = None if body is None else json.dumps(body).encode("utf8")
    req = urllib.request.Request(url, data, headers, method=method)
    try:
        with urllib.request.urlopen(req) as res:
            if res.status in (200, 201, 202):
                content = res.read()
                return json.loads(content.decode("utf8")) if content else None
    except (urllib.error.HTTPError, urllib.error.URLError) as error:
        print(f"Request failed: {error}")
        sys.exit(1)   

def wait_for_task(task_uid: int):
    import time
    deadline = time.time() + 300
    while time.time() < deadline:
        task = http_request("GET", f"{MEILI_HOST}/tasks/{task_uid}")
        if task and task.get("status") in ("succeeded", "failed"):
            if task["status"] == "failed":
                print(f"Meilisearch task failed: {task.get('error')}")
                sys.exit(1)
            return
        time.sleep(0.5)
    print("Timed out waiting for Meilisearch task to finish")
    sys.exit(1)

def update_index_settings():
    task = http_request(
        "PATCH",
        f"{MEILI_HOST}/indexes/{INDEX_NAME}/settings",
        {
            "filterableAttributes": ["scope", "language"],
            "searchableAttributes": ["pageTitle", "heading", "content"],
            "stopWords": ["the", "a"]
        }
    )
    if task and "taskUid" in task:
        wait_for_task(task["taskUid"])
    http_request("GET", f"{MEILI_HOST}/indexes/{INDEX_NAME}")

def create_documents_per_file(content: str, scope: str, language: str, path:
Path, source_dir: Path):
    documents = []
    response = format_md_with_fumadocs(content)
    structured_data = response["structure"]
    page_title = response["title"]
    page_key = page_key_from_path(path, source_dir)
    headings = {item['id']: item['content'] for item in structured_data["headings"]}

    used_ids = {}

    for item in structured_data["contents"]:
        if "heading" in item:
            heading_id =item["heading"]
            heading = headings.get(heading_id, "")
            anchor = f"{page_key}#{heading_id}"
        else:
            heading = ""
            anchor = page_key

        base_id = create_id(path, source_dir, anchor)
    
        if base_id in used_ids:
            used_ids[base_id] += 1
            doc_id = create_id(path, source_dir, anchor, used_ids[base_id])
        else:
            used_ids[base_id] = 0
            doc_id = base_id

        raw_content = item["content"]
        content_without_html = remove_html_elemets(raw_content)
        if not content_without_html.strip():
            raw_content = ""

        documents.append({
            "id": doc_id,
            "url": anchor,
            "rawContent": raw_content,
            "scope": scope,
            "language": language,
            "heading": heading,
            "pageTitle": page_title,
            "content": content_without_html
        })

    return documents

def build_docs(source_dir: str):
    final_documents = []

    for path in source_dir.rglob("*.md*"):
        relativePath = path.relative_to(source_dir).as_posix()   
        folders = relativePath.split("/")

        scope = folders[0] if len(folders) > 1 else ""
        language = language_from_path(path, source_dir)

        with open(path, "r", encoding="utf8") as file:
            content = file.read().strip()

        if not content:
            continue

        documents_per_file = create_documents_per_file(content, scope, language, path, source_dir)
        final_documents.extend(documents_per_file)

    return final_documents

def fetch_all_document_ids() -> set:
    ids = set()
    limit = 1000
    offset = 0
    while True:
        res = http_request(
            "GET",
            f"{MEILI_HOST}/indexes/{INDEX_NAME}/documents"
            f"?limit={limit}&offset={offset}&fields=id",
        )
        results = (res or {}).get("results", [])
        ids.update(doc["id"] for doc in results if "id" in doc)
        if len(results) < limit:
            break
        offset += limit
    return ids


def delete_documents_by_id(ids):
    ids = list(ids)
    batch = 1000
    for i in range(0, len(ids), batch):
        task = http_request(
            "POST",
            f"{MEILI_HOST}/indexes/{INDEX_NAME}/documents/delete-batch",
            ids[i : i + batch],
        )
        if task and "taskUid" in task:
            wait_for_task(task["taskUid"])


def upload(source_dir: str):
    docs = build_docs(source_dir)
    if len(docs) == 0:
        print("No documentation to be uploaded")
        return

    existing_ids = fetch_all_document_ids()
    new_ids = {doc["id"] for doc in docs}

    print(
        f"Uploading {len(docs)} documents to index '{INDEX_NAME}'"
        f" (index currently holds {len(existing_ids)})"
    )
    task = http_request(
        "POST",
        f"{MEILI_HOST}/indexes/{INDEX_NAME}/documents",
        docs,
    )
    if task and "taskUid" in task:
        wait_for_task(task["taskUid"])

    stale_ids = existing_ids - new_ids
    if stale_ids:
        print(f"Removing {len(stale_ids)} documents no longer present in the repository")
        delete_documents_by_id(stale_ids)

if __name__ == "__main__":
    source_dir = process_args()
    update_index_settings()
    upload(source_dir)
