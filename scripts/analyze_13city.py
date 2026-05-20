import json, re

with open('PT_Debug_2026-05-19.json') as f:
    data = json.load(f)

for p in data.get('pages', []):
    if '13city' in p.get('url', ''):
        html = p['html']
        break

# Check medal-cards container
start_tag_1 = '<div class="medal-cards">'
start_idx_1 = html.find(start_tag_1)
print(f"medal-cards container: {'FOUND at ' + str(start_idx_1) if start_idx_1 >= 0 else 'NOT FOUND'}")

# Check medal-container
start_tag_2 = '<div class="medal-container"'
start_idx_2 = html.find(start_tag_2)
print(f"medal-container container: {'FOUND at ' + str(start_idx_2) if start_idx_2 >= 0 else 'NOT FOUND'}")

# Find medal-card references
card_refs = [(m.start(), m.group()) for m in re.finditer(r'<div class="medal-card[^>]*>', html)]
print(f"\nTotal medal-card divs: {len(card_refs)}")
for pos, tag in card_refs[:3]:
    print(f"  pos={pos}: {tag}")

# Check btn buy references
btn_refs = [(m.start(), m.group()) for m in re.finditer(r'class="btn buy"', html)]
print(f"\nTotal 'btn buy' refs: {len(btn_refs)}")
for pos, tag in btn_refs[:3]:
    context = html[max(0,pos-50):pos+80]
    print(f"  pos={pos}: ...{context}...")

# Check button references near medal cards
btn_all = [(m.start(), m.group()[:100]) for m in re.finditer(r'<button[^>]*>', html) if 'buy' in m.group()]
print(f"\nTotal <button> buy refs: {len(btn_all)}")
for pos, tag in btn_all[:3]:
    print(f"  pos={pos}: {tag}")

# Check input buy
input_buy = [(m.start(), m.group()[:100]) for m in re.finditer(r'<input[^>]*buy[^>]*>', html, re.I)]
print(f"\nTotal <input> buy refs: {len(input_buy)}")
for pos, tag in input_buy[:3]:
    print(f"  pos={pos}: {tag}")