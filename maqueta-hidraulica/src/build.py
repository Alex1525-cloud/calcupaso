"""Une todo en un solo HTML que funciona sin internet."""
import pathlib

SRC = pathlib.Path(__file__).resolve().parent
ROOT = SRC.parent


def read(p):
    return (p).read_text(encoding="utf-8")


def lib(name):
    for d in (ROOT / "lib", ROOT.parent / "sismo" / "lib"):
        if (d / name).exists():
            return d / name
    raise FileNotFoundError(name)


def main():
    html = read(SRC / "index.html")
    parts = {
        "{{CSS}}": read(SRC / "style.css"),
        "{{THREE}}": read(lib("three.min.js")),
        "{{ORBIT}}": read(lib("OrbitControls.js")),
        "{{CALC}}": read(SRC / "calc.js"),
        "{{APP}}": read(SRC / "app.js"),
    }
    for k, v in parts.items():
        html = html.replace(k, v.replace("</script>", "<\\/script>"))
    out = ROOT / "index.html"
    out.write_text(html, encoding="utf-8")
    print("ok", out, round(len(html.encode("utf-8")) / 1024), "KB")


if __name__ == "__main__":
    main()
