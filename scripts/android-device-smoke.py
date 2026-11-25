import re
import subprocess
import time
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path

PACKAGE = "ru.moorkis.shodi.debug"
LAUNCHER = "com.google.android.apps.nexuslauncher"
def adb(*args, timeout=40):
    return subprocess.check_output(["adb", *args], stderr=subprocess.STDOUT, timeout=timeout).decode("utf-8", "replace")
def normalized(text):
    return " ".join(unicodedata.normalize("NFKC", text).casefold().split())
def hierarchy():
    adb("shell", "uiautomator", "dump", "/sdcard/shodi-window.xml", timeout=25)
    return ET.fromstring(adb("shell", "cat", "/sdcard/shodi-window.xml"))
def matches(node, text):
    return any(normalized(node.get(attr,"")) == normalized(text) for attr in ("text","content-desc"))
def touch_bounds(node):
    bounds=list(map(int,re.findall(r"\d+",node.get("bounds",""))))
    if len(bounds)!=4 or bounds[2]<=bounds[0] or bounds[3]<=bounds[1]:
        return None
    return bounds

def find_text(text, timeout=90, dialog_button=None, dialog_title=None, recover_launcher=False, prefix=False, visible=False):
    end=time.monotonic()+timeout
    seen=[]
    recovered=False
    while time.monotonic()<end:
        try:
            nodes=list(hierarchy().iter("node"))
            seen=[n.get("text") or n.get("content-desc") or n.get("resource-id") for n in nodes]
            launcher_anr = any(n.get("package") == "android" and normalized(n.get("text","")) in ("pixel launcher isn't responding", "pixel launcher isn’t responding") for n in nodes)
            if launcher_anr and recover_launcher and not recovered:
                # Only recover the confirmed unrelated system launcher ANR once.
                # Never dismiss or retry an ANR of SHODI itself.
                print("Recovering emulator Pixel Launcher ANR", flush=True)
                capture("android-launcher-anr.png")
                adb("shell", "am", "force-stop", LAUNCHER)
                launch()
                recovered=True
                time.sleep(3)
                continue
            for node in nodes:
                if (matches(node,text) or (prefix and any(normalized(node.get(attr,"" )).startswith(normalized(text)) for attr in ("text","content-desc")))) and (not visible or touch_bounds(node)):
                    return node
            if dialog_button and any(matches(n,dialog_title) for n in nodes):
                for node in nodes:
                    if node.get("resource-id")==dialog_button and node.get("enabled")=="true":
                        # Android themes may transform button labels to all caps.
                        assert matches(node,text), "Unexpected consent button label: "+str(node.attrib)
                        return node
        except (ET.ParseError,subprocess.SubprocessError):
            pass
        time.sleep(2)
    raise AssertionError("Android UI element not found: "+text+"; visible nodes: "+str(seen[:80]))
def tap_node(node):
    x1,y1,x2,y2=map(int,re.findall(r"\d+",node.get("bounds")))
    assert x2>x1 and y2>y1,"Empty touch bounds"
    adb("shell","input","tap",str((x1+x2)//2),str((y1+y2)//2))
def tap(text, **kwargs):
    tap_node(find_text(text, visible=True, **kwargs))
def scroll_to(text, prefix=False, direction=1):
    # Use actual screen dimensions; WebView exposes only visible accessible nodes.
    w,h=map(int,re.findall(r"(\d+)x(\d+)",adb("shell","wm","size"))[-1])
    for _ in range(12):
        clipped=None
        unsettled=False
        for n in hierarchy().iter("node"):
            if n.get("package")!=PACKAGE: continue
            values=[normalized(n.get(attr,"")) for attr in ("text","content-desc")]
            if matches(n,text) or (prefix and any(v.startswith(normalized(text)) for v in values)):
                bounds=touch_bounds(n)
                # WebView can expose a clipped edge of a button during a swipe.
                # Do not tap it until its touch target is visible and stationary.
                if bounds and bounds[3]-bounds[1]>=(32 if n.get("clickable")=="true" else 12):
                    time.sleep(0.6)
                    for settled in hierarchy().iter("node"):
                        if settled.get("package")==PACKAGE and touch_bounds(settled)==bounds and (matches(settled,text) or (prefix and any(normalized(settled.get(a,"")).startswith(normalized(text)) for a in ("text","content-desc")))):
                            return settled
                    unsettled=True
                    break
                if bounds:
                    clipped=bounds
        if unsettled:
            continue
        if clipped:
            # Bring a partial element toward the viewport center rather than
            # overshooting it with a full swipe in the original direction.
            y1,y2=(int(h*.67),int(h*.37)) if (clipped[1]+clipped[3])/2>h/2 else (int(h*.37),int(h*.67))
        else:
            y1,y2=int(h*.75),int(h*.28)
            if direction<0:y1,y2=y2,y1
        adb("shell","input","swipe",str(w//2),str(y1),str(w//2),str(y2),"450")
        time.sleep(1)
    raise AssertionError("Cannot scroll to: "+text)
def wait_for_boot():
    deadline = time.monotonic() + 120
    while time.monotonic() < deadline:
        try:
            if adb("shell", "getprop", "sys.boot_completed").strip() == "1" and "package:" in adb("shell", "pm", "path", "android"):
                break
        except subprocess.SubprocessError:
            pass
        time.sleep(3)
    else:
        raise AssertionError("Emulator package manager not ready")
    adb("shell", "input", "keyevent", "KEYCODE_WAKEUP")
    adb("shell", "wm", "dismiss-keyguard")
    # boot_completed can precede launcher startup and its initial workload.
    time.sleep(12)
    if "package:" in adb("shell", "pm", "path", LAUNCHER):
        adb("shell", "am", "force-stop", LAUNCHER)

def launch():
    result=adb("shell","am","start","-W","-n",PACKAGE+"/ru.moorkis.shodi.MainActivity")
    print(result,flush=True)
    assert "Error:" not in result and "Exception" not in result and "Status: ok" in result, result
def capture(name):
    with open(name,"wb") as f:
        subprocess.run(["adb","exec-out","screencap","-p"],stdout=f,check=True,timeout=20)
def assert_refusal():
    raw=adb("shell","run-as",PACKAGE,"cat","shared_prefs/privacy.xml")
    prefs=ET.fromstring(raw)
    assert any(n.get("name")=="ads_personalized" and n.get("value")=="false" for n in prefs),"Consent refusal not persisted"
def run():
    wait_for_boot()
    adb("install","-r","apk/app-debug.apk")
    adb("shell","pm","clear",PACKAGE)
    adb("logcat","-b","main","-b","system","-b","events","-b","crash","-c")
    launch()
    find_text("Персонализация рекламы", timeout=120, recover_launcher=True)
    capture("android-consent.png")
    tap("Без персонализации",dialog_button="android:id/button2",dialog_title="Персонализация рекламы")
    find_text("О приложении")
    assert_refusal()
    tap("О приложении")
    find_text("Разработчик и поддержка")
    capture("android-about.png")
    adb("shell","input","keyevent","4")
    adb("shell","svc","wifi","disable")
    adb("shell","svc","data","disable")
    adb("shell","am","force-stop",PACKAGE)
    launch()
    find_text("О приложении")
    assert_refusal()
    capture("android-offline.png")
    # Real WebView route creation from the bundled catalog, offline.
    add=scroll_to("Добавить в маршрут:",prefix=True)
    capture("android-catalog-places.png")
    tap_node(add)
    find_text("Санкт-Петербург — прогулка",prefix=True,timeout=20)
    # Start at a known scroll position after the catalog re-renders. A long
    # reverse swipe from a card could leave the open button clipped or moving.
    nodes=list(hierarchy().iter("node"))
    top=next((n for n in nodes if matches(n,"Вернуться наверх") and touch_bounds(n)),None)
    if top is not None:
        tap_node(top)
    elif not any(matches(n,"О приложении") and touch_bounds(n) for n in nodes):
        scroll_to("О приложении",direction=-1)
    find_text("О приложении",visible=True,timeout=20)
    tap_node(scroll_to("Открыть маршрут"))
    find_text("Удалить маршрут",timeout=20)
    scroll_to("Удалить маршрут")
    address=scroll_to("Адрес по каталогу:",prefix=True)
    assert address is not None
    capture("android-route.png")
    adb("shell","am","force-stop",PACKAGE)
    launch()
    find_text("О приложении")
    tap("Санкт-Петербург — прогулка",prefix=True)
    find_text("Удалить маршрут",timeout=20)
    # Reopening a saved route starts at the top; its actions are below the viewport.
    tap_node(scroll_to("Удалить маршрут"))
    tap("Отмена")
    tap_node(scroll_to("Удалить маршрут"))
    tap("Удалить")
    find_text("Куда пойдём?")
    adb("shell","am","force-stop",PACKAGE)
    launch()
    find_text("О приложении")
    assert not any(any(normalized(n.get(a,"" )).startswith(normalized("Санкт-Петербург — прогулка")) for a in ("text","content-desc")) for n in hierarchy().iter("node")),"Deleted route persisted"
    # Full reset is an Android system operation, performed only on the test app.
    assert "Success" in adb("shell","pm","clear",PACKAGE)
    launch()
    find_text("Персонализация рекламы")
    assert adb("shell","pidof",PACKAGE).strip(),"Application process stopped"
    log=adb("logcat","-d","-s","AndroidRuntime:E")
    assert "Process: "+PACKAGE not in log,"Android runtime crash: "+log[-3000:]
    anrs=adb("logcat","-d","-b","events","-s","am_anr:I")
    assert not any(PACKAGE in line for line in anrs.splitlines()),"SHODI ANR: "+anrs[-3000:]
    print("Android emulator: launch, legal section, persisted refusal, offline catalog route/address, deletion and full reset passed")
try:
    run()
except Exception:
    for action in (
        lambda: capture("android-failure.png"),
        lambda: Path("android-failure.xml").write_text(ET.tostring(hierarchy(),encoding="unicode"),encoding="utf-8"),
        lambda: Path("android-failure-log.txt").write_text(adb("logcat","-d","-s","AndroidRuntime:E","ActivityTaskManager:I"),encoding="utf-8"),
    ):
        try: action()
        except Exception as e: print("Diagnostic capture failed:",e,flush=True)
    raise
finally:
    try:
        adb("shell","svc","wifi","enable")
        adb("shell","svc","data","enable")
    except Exception:
        pass
