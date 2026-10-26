import io
path = "src/components/QasrMap.jsx"
with io.open(path, "r", encoding="utf-8") as f:
    content = f.read()

old1 = "const [showHaddZone, setShowHaddZone] = useState(true);"
new1 = old1 + "\n  const [showHaddExplainer, setShowHaddExplainer] = useState(false);"
content = content.replace(old1, new1, 1)
print("state:", old1 not in content)

old2 = "Hadd al-Tarakhkhus</h3>"
new2 = "Hadd al-Tarakhkhus</h3><button onClick={() => setShowHaddExplainer(!showHaddExplainer)} class=\"w-7 h-7 rounded-full bg-[var(VAR_SEC)] hover:bg-[var(VAR_BRD)] text-[var(VAR_TSC)] hover:text-[var(VAR_TP)] transition-colors flex items-center justify-center text-xs font-semibold\" title=\"Why this recommendation?\">\u24d8</button>"
new2 = new2.replace("VAR_SEC", "--bg-secondary")
new2 = new2.replace("VAR_BRD", "--border")
new2 = new2.replace("VAR_TSC", "--text-secondary")
new2 = new2.replace("VAR_TP", "--text-primary")
content = content.replace(old2, new2, 1)
print("button:", old2 not in content)

with io.open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("QasrMap.jsx patched OK")