import io
c=open('src/utils/geoUtils.js','r',encoding='utf-8').read()
s=c.find('export async function fetchUrfBoundary')
e=c.find('function convexHull',s)
r='export async function fetchUrfBoundary(cityName, state)'+' {'+N+'  return fetchCityBoundary(cityName, state)'+N+'}'
c_new=c[:s]+r+c[e:]
open('src/utils/geoUtils.js','w',encoding='utf-8').write(c_new)
print('OK')