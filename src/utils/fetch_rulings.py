import urllib.request
import re

def fetch_text(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    response = urllib.request.urlopen(req, timeout=10)
    html = response.read().decode('utf-8')
    text = re.sub(r'<[^>]+>', ' ', html)
    text = re.sub(r'\s+', ' ', text)
    return text

# Find all chapter links in Islamic Laws
url = 'https://www.sistani.org/english/book/48/'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
response = urllib.request.urlopen(req, timeout=10)
html = response.read().decode('utf-8')

links = re.findall(r'href="(/english/book/48/\d+/)"[^>]*>([^<]+)<', html)
print("=== Islamic Laws - Chapter Links ===")
for url_path, title in links:
    title = re.sub(r'\s+', ' ', title).strip()
    full_url = f'https://www.sistani.org{url_path}'
    if any(x in title.lower() for x in ['prayer', 'travel', 'qasr', 'musafir', 'shorten', 'trave']):
        print(f"  MATCH: {full_url} -> {title}")
    elif 'chapter' in title.lower() and 'five' in title.lower():
        print(f"  CHAPTER: {full_url} -> {title}")
    elif 'chapter' in title.lower() and 'eight' in title.lower():
        print(f"  CHAPTER: {full_url} -> {title}")
    elif 'chapter' in title.lower() and 'fourteen' in title.lower():
        print(f"  CHAPTER: {full_url} -> {title}")
    elif 'prayer' in title.lower():
        print(f"  PRAYER: {full_url} -> {title}")
    elif 'salah' in title.lower():
        print(f"  SALAH: {full_url} -> {title}")