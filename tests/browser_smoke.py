"""Isolated browser verification; requires Playwright (not needed to play).
Start server.py first. Supports a GitHub Pages-like subpath in GAME_URL.
Each case uses a new browser context and never touches an existing browser profile.
"""
import io
import json
import math
import os
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE=os.environ.get('GAME_URL','http://127.0.0.1:8791/').rstrip('/')+'/'
OUT=Path(__file__).resolve().parents[1]/'test-results'


def debug(page):
    return page.evaluate('typeof window.__spaceDebug === \"function\" ? window.__spaceDebug() : window.__spaceDebug')


def wait_ready(page):
    page.goto(BASE,wait_until='load')
    page.wait_for_function('!document.getElementById("startNew").disabled || !document.getElementById("errorPanel").hidden',timeout=30000)
    assert page.locator('#errorPanel').is_hidden(), page.locator('#errorText').inner_text()
    assert not page.locator('#startNew').is_disabled()


def position_delta(a,b):
    return math.sqrt(sum((a[k]-b[k])**2 for k in ('x','y','z')))


def main():
    OUT.mkdir(exist_ok=True)
    results=[]
    with sync_playwright() as p:
        opts={'headless':True,'args':['--no-sandbox']}
        if os.environ.get('CHROME_EXECUTABLE'):opts['executable_path']=os.environ['CHROME_EXECUTABLE']
        browser=p.chromium.launch(**opts)
        errors=[]
        ctx=browser.new_context(viewport={'width':1366,'height':768})
        page=ctx.new_page()
        page.on('pageerror',lambda e:errors.append(str(e)))
        wait_ready(page)
        assert page.locator('#resume').is_hidden()
        page.screenshot(path=str(OUT/'desktop-welcome.png'))
        page.locator('#startNew').click()
        before=debug(page)
        assert before['started'] and not before['paused'] and not before['firstPerson']
        assert 'WebGL 1' in before['webgl']
        page.keyboard.down('w');page.wait_for_timeout(650);page.keyboard.up('w')
        after=debug(page)
        assert position_delta(before['position'],after['position'])>0.1
        page.keyboard.down('q');page.wait_for_timeout(500);page.keyboard.up('q')
        climbed=debug(page)
        assert climbed['position']['y']>after['position']['y']
        speed=climbed['speed']
        page.keyboard.down('Space');page.wait_for_timeout(600);page.keyboard.up('Space')
        assert debug(page)['speed']<speed
        # Mouse and keyboard look, then pause/settings.
        initial=debug(page)['rotation']['y']
        page.keyboard.down('ArrowRight');page.wait_for_timeout(350);page.keyboard.up('ArrowRight')
        assert abs(debug(page)['rotation']['y']-initial)>.05
        page.mouse.move(600,400);page.mouse.down();page.mouse.move(680,420,steps=6);page.mouse.up()
        page.wait_for_timeout(180)
        page.screenshot(path=str(OUT/'desktop-flight.png'))
        page.locator('#pauseButton').click()
        assert debug(page)['paused']
        page.locator('#saveButton').click()
        saved=page.evaluate('JSON.parse(localStorage.getItem("spaceExplorer.gameState"))')
        assert saved and saved['lastSaved']
        page.locator('#settingsButton').click()
        page.locator('#shipSelect').select_option('ship_03')
        page.locator('#quality').select_option('hd')
        hd=debug(page)['render']
        page.locator('#quality').select_option('low')
        low=debug(page)['render']
        assert hd['width']*hd['height']>low['width']*low['height']
        prefs=page.evaluate('JSON.parse(localStorage.getItem("spaceExplorer.playerSettings"))')
        assert prefs['selectedShip']=='ship_03'
        assert page.evaluate('localStorage.getItem("gameState")') is None
        wait_ready(page)
        assert page.locator('#resume').is_visible()
        page.locator('#resume').click()
        resumed=debug(page)
        assert position_delta(saved['position'],resumed['position'])<.01
        assert resumed['speed']==0
        assert page.locator('#shipSelect').input_value()=='ship_03'
        page.locator('#helpButton').click()
        assert page.locator('#helpPanel').is_visible()
        page.locator('#closeHelp').click()
        assert page.locator('#helpPanel').is_hidden()
        assert not errors, errors
        results.append({'case':'desktop flight, brake, look, pause, preferences and resume','status':'pass','render':resumed})
        ctx.close()
        for width,height in [(320,640),(393,852),(768,480),(852,393)]:
            ctx=browser.new_context(viewport={'width':width,'height':height},device_scale_factor=1,is_mobile=True,has_touch=True)
            page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
            wait_ready(page)
            assert page.evaluate('document.getElementById("welcome").scrollWidth')<=width
            page.locator('#startNew').click()
            assert page.evaluate('document.documentElement.scrollWidth')<=width
            controls=page.locator('#stickZone,[data-control]')
            boxes=[]
            for i in range(controls.count()):
                control=controls.nth(i);assert control.is_visible()
                box=control.bounding_box();assert box['width']>=44 and box['height']>=44
                assert box['x']>=0 and box['x']+box['width']<=width+1
                assert box['y']>=0 and box['y']+box['height']<=height+1
                boxes.append(box)
            for i,a in enumerate(boxes):
                for b in boxes[i+1:]:
                    assert not (a['x']<b['x']+b['width'] and b['x']<a['x']+a['width'] and a['y']<b['y']+b['height'] and b['y']<a['y']+a['height'])
            if width==393:
                cdp=ctx.new_cdp_session(page)
                joy=page.locator('#stickZone').bounding_box();button=page.locator('[data-control=forward]').bounding_box()
                before=debug(page)
                cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':joy['x']+joy['width']*.75,'y':joy['y']+joy['height']*.5,'id':1},{'x':button['x']+22,'y':button['y']+22,'id':2}]})
                page.wait_for_timeout(700)
                after=debug(page)
                assert position_delta(before['position'],after['position'])>.1
                assert abs(after['rotation']['y']-before['rotation']['y'])>.03
                cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
                page.locator('#pauseButton').click()
                paused=debug(page)
                page.wait_for_timeout(200)
                assert position_delta(paused['position'],debug(page)['position'])==0
                page.locator('#continueButton').click()
                page.screenshot(path=str(OUT/'android-flight.png'))
            assert not errors,errors
            results.append({'case':f'mobile {width}x{height} controls/layout','status':'pass'})
            ctx.close()
        # Storage denial still permits play.
        ctx=browser.new_context()
        ctx.add_init_script('Object.defineProperty(window,"localStorage",{get(){throw new DOMException("Blocked","SecurityError")}})')
        page=ctx.new_page();wait_ready(page);page.locator('#startNew').click()
        assert debug(page)['started']
        page.locator('#pauseButton').click();page.locator('#saveButton').click()
        assert any(word in page.locator('#saveStatus').inner_text().lower() for word in ['gagal','tidak','tersedia','nonaktif'])
        results.append({'case':'storage denial','status':'pass'});ctx.close()
        # Disabled WebGL must show actionable error, not endless loading.
        ctx=browser.new_context()
        ctx.add_init_script('const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==="webgl"||type==="experimental-webgl"?null:original.call(this,type,...args)}')
        page=ctx.new_page();page.goto(BASE);page.locator('#errorPanel').wait_for(state='visible',timeout=15000)
        assert 'webgl' in page.locator('#errorText').inner_text().lower()
        results.append({'case':'unsupported WebGL error','status':'pass'});ctx.close()
        browser.close()
    (OUT/'browser-results.json').write_text(json.dumps(results,indent=2)+'\n',encoding='utf-8')
    for item in results:print('PASS',item['case'])
    print('No JavaScript page errors in normal desktop/mobile flows. Results:',OUT/'browser-results.json')

if __name__=='__main__':main()
