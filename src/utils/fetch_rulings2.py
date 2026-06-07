import urllib.request
import re

def fetch_text(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    response = urllib.request.urlopen(req, timeout=10)
    html = response.read().decode('utf-8')
    text = re.sub(r'<[^>]+>', ' ', html)
    text = re.sub(r'\s+', ' ', text)
    return text

# Find Q&A topics about Qasr/Traveler
url = 'https://www.sistani.org/english/qa/'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
response = urllib.request.urlopen(req, timeout=10)
html = response.read().decode('utf-8')

pattern = r'href="(/english/qa/\d+/)"[^>]*>([^<]+)<'
links = re.findall(pattern, html)
print('=== Q&A Topics ===')
for url_path, title in links:
    title = re.sub(r'\s+', ' ', title).strip()
    full_url = 'https://www.sistani.org' + url_path
    lower = title.lower()
    if any(x in lower for x in ['qasr', 'travel', 'musafir', 'boundary', 'tarakhkhus']):
        print(f'  MATCH: {full_url} -> {title}')