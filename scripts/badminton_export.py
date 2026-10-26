"""PNG registration used by JPEXS26.2.1 DefineSpriteTag/FrameExporter.

SVG uses the unfiltered displayRect; PNG uses getDisplayRectWithFilters().
The exporter expands each axis by the greatest child padding or the rounded-up
sum of filters on a placement. These are raster-export bounds, not AS2 hitboxes.
https://github.com/jindrapetrik/jpexs-decompiler/blob/version26.2.1/libsrc/ffdec_lib/src/com/jpexs/decompiler/flash/tags/DefineSpriteTag.java
"""
import math

def filter_padding(sid,symbols,seen=None):
    if sid not in symbols:return [0,0]
    seen=set() if seen is None else seen
    assert sid not in seen,'Cyclic export symbol'
    seen=seen|{sid};padding=[0,0]
    for e in symbols[sid].find('subTags'):
        if not e.get('type','').startswith('PlaceObject') or e.get('placeFlagMove')=='true':continue
        child=filter_padding(int(e.get('characterId','-1')),symbols,seen)
        delta=[0.,0.]
        for f in e.find('surfaceFilterList') or []:
            kind=f.get('type');assert kind in ['BLURFILTER','GLOWFILTER','DROPSHADOWFILTER','BEVELFILTER'],kind
            for axis in [0,1]:
                value=float(f.get('blurX' if axis==0 else 'blurY','0'))
                if kind in ['DROPSHADOWFILTER','BEVELFILTER']:
                    trig=math.cos if axis==0 else math.sin
                    value+=abs(float(f.get('distance'))*trig(float(f.get('angle'))))
                delta[axis]+=value
        padding=[max(padding[i],child[i],math.ceil(delta[i])) for i in [0,1]]
    return padding
