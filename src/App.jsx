import { useState, useEffect } from 'react'
import './App.css'
import { MapContainer, TileLayer, GeoJSON, useMap, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Input, Button, Upload, Space, Card, message, Typography, Select } from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import toGeoJSON from '@mapbox/togeojson'

// Debrecen coordinates (default)
const DEFAULT_CENTER = [47.5316, 21.6273]

// Simple purple gradient based on value range
function getColorForValue(value, min, max) {
  if (
    !Number.isFinite(value) ||
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    min === max
  ) {
    return '#7c3aed' // default mid purple
  }

  const t = (value - min) / (max - min)
  // light purple -> deep purple
  const start = { r: 237, g: 233, b: 254 } // #ede9fe
  const end = { r: 88, g: 28, b: 135 } // #581c87

  const r = Math.round(start.r + (end.r - start.r) * t)
  const g = Math.round(start.g + (end.g - start.g) * t)
  const b = Math.round(start.b + (end.b - start.b) * t)

  return `rgb(${r}, ${g}, ${b})`
}

// Component to update map center when coordinates change
function MapUpdater({ center }) {
  const map = useMap()
  useEffect(() => {
    map.setView(center, map.getZoom())
  }, [center, map])
  return null
}

// Component to update map zoom when zoom changes
function ZoomUpdater({ zoom }) {
  const map = useMap()
  useEffect(() => {
    map.setZoom(zoom)
  }, [zoom, map])
  return null
}

// Component to fit bounds when KML data changes
function BoundsFitter({ geojson }) {
  const map = useMap()
  useEffect(() => {
    if (geojson && geojson.features && geojson.features.length > 0) {
      try {
        const bounds = geojson.features.reduce((bounds, feature) => {
          if (feature.geometry && feature.geometry.coordinates) {
            const coords = feature.geometry.coordinates
            if (feature.geometry.type === 'Point') {
              return bounds.extend([coords[1], coords[0]])
            } else if (feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiLineString') {
              const flatCoords = feature.geometry.type === 'LineString' 
                ? coords 
                : coords.flat()
              flatCoords.forEach(coord => {
                bounds.extend([coord[1], coord[0]])
              })
            } else if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
              const flatCoords = feature.geometry.type === 'Polygon'
                ? coords.flat()
                : coords.flat(2)
              flatCoords.forEach(coord => {
                bounds.extend([coord[1], coord[0]])
              })
            }
          }
          return bounds
        }, L.latLngBounds([]))
        
        if (bounds.isValid()) {
          map.fitBounds(bounds)
        }
      } catch (error) {
        console.error('Error fitting bounds:', error)
      }
    }
  }, [geojson, map])
  return null
}

// Map tile themes - free options for better readability
const MAP_THEMES = {
  positron: {
    name: 'Positron (Light)',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  darkMatter: {
    name: 'Dark Matter',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  voyager: {
    name: 'Voyager',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  osm: {
    name: 'OpenStreetMap',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
}

function App() {
  const [center, setCenter] = useState(DEFAULT_CENTER)
  const [lat, setLat] = useState(DEFAULT_CENTER[0].toString())
  const [lng, setLng] = useState(DEFAULT_CENTER[1].toString())
  const [zoom, setZoom] = useState(13)
  const [zoomInput, setZoomInput] = useState('13')
  const [kmlData, setKmlData] = useState(null)
  const [csvRows, setCsvRows] = useState([])
  const [selectedMetric, setSelectedMetric] = useState('revenue')
  const [mapTheme, setMapTheme] = useState('positron')

  // Debug: log when kmlData or csvRows change
  useEffect(() => {
    if (kmlData && csvRows.length > 0) {
      console.log('KML Features:', kmlData.features.map(f => ({
        name: f.properties?.name || f.properties?.Name,
        id: f.id || f.properties?.id,
        hasId: !!f.id,
        hasPropertiesId: !!f.properties?.id
      })))
      console.log('CSV Rows:', csvRows.map(r => r.id))
    }
  }, [kmlData, csvRows])

  const handleSetCenter = () => {
    const latNum = parseFloat(lat)
    const lngNum = parseFloat(lng)
    
    if (isNaN(latNum) || isNaN(lngNum)) {
      message.error('Please enter valid coordinates')
      return
    }
    
    if (latNum < -90 || latNum > 90) {
      message.error('Latitude must be between -90 and 90')
      return
    }
    
    if (lngNum < -180 || lngNum > 180) {
      message.error('Longitude must be between -180 and 180')
      return
    }
    
    setCenter([latNum, lngNum])
    message.success('Map center updated')
  }

  const handleSetZoom = () => {
    const zoomNum = parseFloat(zoomInput)
    
    if (isNaN(zoomNum)) {
      message.error('Please enter a valid zoom level')
      return
    }
    
    if (zoomNum < 1 || zoomNum > 20) {
      message.error('Zoom level must be between 1 and 20')
      return
    }
    
    setZoom(zoomNum)
    message.success('Zoom level updated')
  }

  const handleKmlUpload = (file) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const kmlText = e.target.result
        // Use the browser's built-in DOMParser to parse the KML XML string
        const parser = new DOMParser()
        const kml = parser.parseFromString(kmlText, 'text/xml')
        const geojson = toGeoJSON.kml(kml)
        
        // Extract Placemark IDs and names from the KML XML
        const placemarks = Array.from(kml.querySelectorAll('Placemark'))
        const placemarkData = placemarks.map((placemark) => {
          const id = placemark.getAttribute('id')
          const nameEl = placemark.querySelector('name')
          const name = nameEl ? nameEl.textContent : ''
          return { id, name }
        }).filter(p => p.id) // Only keep placemarks with IDs
        
        // Create a map of name -> id for fallback matching
        const nameToIdMap = new Map()
        placemarkData.forEach(p => {
          if (p.name && p.id) {
            nameToIdMap.set(p.name.trim(), p.id)
          }
        })
        
        // Add IDs to GeoJSON features
        if (geojson.features && geojson.features.length > 0) {
          geojson.features.forEach((feature, index) => {
            // Try to get ID from placemark at same index first
            let id = placemarkData[index]?.id
            
            // If no ID by index, try matching by name
            if (!id) {
              const featureName = (feature.properties?.name || feature.properties?.Name || '').trim()
              id = nameToIdMap.get(featureName)
            }
            
            // Store ID in multiple places for maximum compatibility
            if (id) {
              feature.id = id
              if (!feature.properties) {
                feature.properties = {}
              }
              feature.properties.id = id
              feature.properties.placemarkId = id // Extra backup
            }
            
            // Also try to preserve any existing ID
            if (!feature.id && feature.properties?.id) {
              feature.id = feature.properties.id
            }
          })
          
          // Debug: log the IDs we extracted
          console.log('Extracted Placemark data:', placemarkData)
          console.log('GeoJSON features with IDs:', geojson.features.map(f => ({
            name: f.properties?.name || f.properties?.Name,
            id: f.id || f.properties?.id,
            propertiesId: f.properties?.id
          })))
        }
        
        if (geojson.features && geojson.features.length > 0) {
          setKmlData(geojson)
          message.success('KML file loaded successfully')
        } else {
          message.warning('KML file contains no features')
        }
      } catch (error) {
        console.error('Error parsing KML:', error)
        message.error('Failed to parse KML file. Please check the file format.')
      }
    }
    reader.readAsText(file)
    return false // Prevent default upload behavior
  }

  const handleCsvUpload = (file) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target.result
        const lines = text.trim().split(/\r?\n/)
        if (lines.length < 2) {
          message.warning('CSV file appears to be empty')
          return
        }

        const header = lines[0].split(',').map((h) => h.trim())
        const idIndex = header.indexOf('id')
        const revenueIndex = header.indexOf('revenue')
        const costIndex = header.indexOf('cost')

        if (idIndex === -1 || revenueIndex === -1 || costIndex === -1) {
          message.error('CSV must contain id, revenue and cost columns')
          return
        }

        const rows = lines.slice(1).map((line) => {
          const cols = line.split(',').map((c) => c.trim())
          return {
            id: cols[idIndex],
            revenue: Number(cols[revenueIndex]),
            cost: Number(cols[costIndex]),
          }
        })

        setCsvRows(rows)
        // Reset metric to revenue when new CSV is uploaded
        setSelectedMetric('revenue')
        // Debug: log CSV IDs
        console.log('CSV rows loaded:', rows.map(r => ({ id: r.id, revenue: r.revenue, cost: r.cost })))
        message.success('CSV file loaded successfully')
      } catch (error) {
        console.error('Error parsing CSV:', error)
        message.error('Failed to parse CSV file. Please check the file format.')
      }
    }
    reader.readAsText(file)
    return false
  }

  // Create a map of CSV IDs to rows for faster lookup
  const csvIdMap = new Map()
  csvRows.forEach((row) => {
    csvIdMap.set(row.id, row)
  })

  const metricValues =
    csvRows.length > 0
      ? csvRows
          .map((row) => Number(row[selectedMetric]))
          .filter((v) => Number.isFinite(v))
      : []

  const metricMin =
    metricValues.length > 0 ? Math.min(...metricValues) : null
  const metricMax =
    metricValues.length > 0 ? Math.max(...metricValues) : null

  return (
    <div className="map-page">
      <Card className="controls-card">
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            Map controls
          </Typography.Title>
          
          <Space wrap>
            <div>
              <Typography.Text type="secondary">Latitude</Typography.Text>
              <Input
                placeholder="47.5316"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                style={{ width: 200, marginTop: 4 }}
              />
            </div>
            <div>
              <Typography.Text type="secondary">Longitude</Typography.Text>
              <Input
                placeholder="21.6273"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                style={{ width: 200, marginTop: 4 }}
              />
            </div>
            <div>
              <Typography.Text type="secondary">Zoom</Typography.Text>
              <Input
                placeholder="13"
                value={zoomInput}
                onChange={(e) => setZoomInput(e.target.value)}
                style={{ width: 120, marginTop: 4 }}
                type="number"
                min={1}
                max={20}
              />
            </div>
            <Button type="primary" onClick={handleSetCenter} style={{ alignSelf: 'flex-end' }}>
              Set center
            </Button>
            <Button onClick={handleSetZoom} style={{ alignSelf: 'flex-end' }}>
              Set zoom
            </Button>
          </Space>
          
          <Space>
            <Upload
              accept=".kml"
              beforeUpload={handleKmlUpload}
              showUploadList={false}
            >
              <Button icon={<UploadOutlined />}>Upload KML file</Button>
            </Upload>
            
            {kmlData && (
              <Button onClick={() => setKmlData(null)}>
                Clear KML
              </Button>
            )}
          </Space>

          <Space>
            <Upload
              accept=".csv"
              beforeUpload={handleCsvUpload}
              showUploadList={false}
            >
              <Button icon={<UploadOutlined />}>Upload CSV file</Button>
            </Upload>

            {csvRows.length > 0 && (
              <Space>
                <Typography.Text type="secondary">
                  Color by
                </Typography.Text>
                <Select
                  value={selectedMetric}
                  onChange={setSelectedMetric}
                  style={{ width: 160 }}
                  options={[
                    { value: 'revenue', label: 'Revenue' },
                    { value: 'cost', label: 'Cost' },
                  ]}
                />
              </Space>
            )}

            <Space>
              <Typography.Text type="secondary">
                Map theme
              </Typography.Text>
              <Select
                value={mapTheme}
                onChange={setMapTheme}
                style={{ width: 180 }}
                options={Object.entries(MAP_THEMES).map(([key, theme]) => ({
                  value: key,
                  label: theme.name,
                }))}
              />
            </Space>
          </Space>
        </Space>
      </Card>
      
      <MapContainer
        className="map-container"
        center={center}
        zoom={zoom}
        scrollWheelZoom
      >
        {csvRows.length > 0 && (
          <div
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              zIndex: 1000,
              background: 'rgba(17, 24, 39, 0.9)',
              color: '#f9fafb',
              padding: '6px 10px',
              borderRadius: 6,
              fontSize: 12,
              boxShadow: '0 4px 10px rgba(0,0,0,0.25)',
            }}
          >
            <div style={{ fontWeight: 500, marginBottom: 2 }}>
              Color scheme
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ textTransform: 'capitalize' }}>
                {selectedMetric}
              </span>
              <span style={{ opacity: 0.8 }}>· purple scale</span>
            </div>
          </div>
        )}
        <MapUpdater center={center} />
        <ZoomUpdater zoom={zoom} />
        {kmlData && <BoundsFitter geojson={kmlData} />}
        <TileLayer
          attribution={MAP_THEMES[mapTheme].attribution}
          url={MAP_THEMES[mapTheme].url}
        />
        {kmlData && (
          <GeoJSON
            data={kmlData}
            style={(feature) => {
              // Try multiple ways to get the ID
              const featureId =
                feature?.id || 
                feature?.properties?.id ||
                feature?.properties?.Id ||
                feature?.properties?.ID

              // Use the map for faster lookup
              const csvRow = featureId ? csvIdMap.get(featureId) : null

              let fillColor =
                feature?.properties?.fill || '#3388ff'
              let strokeColor =
                feature?.properties?.stroke || '#3388ff'

              if (
                csvRow &&
                metricMin != null &&
                metricMax != null
              ) {
                const value = Number(csvRow[selectedMetric])
                const color = getColorForValue(
                  value,
                  metricMin,
                  metricMax,
                )
                fillColor = color
                strokeColor = color
              }

              return {
                color: strokeColor,
                weight: feature?.properties?.['stroke-width'] || 3,
                opacity: feature?.properties?.['stroke-opacity'] || 0.8,
                fillColor,
                fillOpacity: feature?.properties?.['fill-opacity'] || 0.2,
              }
            }}
            onEachFeature={(feature, layer) => {
              // Try multiple ways to get the ID
              const featureId =
                feature?.id || 
                feature?.properties?.id ||
                feature?.properties?.Id ||
                feature?.properties?.ID

              // Use the map for faster lookup
              const csvRow = featureId ? csvIdMap.get(featureId) : null

              // Debug logging (only log mismatches)
              if (featureId && csvRows.length > 0 && !csvRow) {
                console.log('No CSV match found:', {
                  featureId,
                  featureName: feature?.properties?.name || feature?.properties?.Name,
                  availableIds: Array.from(csvIdMap.keys())
                })
              }

              const featureName =
                feature?.properties?.name || feature?.properties?.Name || 'Unnamed'

              if (csvRow) {
                // Format numbers with thousand separators
                const formatNumber = (num) => {
                  return Number(num).toLocaleString('en-US')
                }

                layer.bindPopup(
                  `<div style="font-family: system-ui, -apple-system, sans-serif; min-width: 200px;">
                    <div style="font-weight: 600; font-size: 14px; margin-bottom: 8px; color: #1f2937;">
                      ${featureName}
                    </div>
                    <div style="border-top: 1px solid #e5e7eb; padding-top: 8px;">
                      <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                        <span style="color: #6b7280; font-size: 12px;">ID:</span>
                        <span style="color: #111827; font-weight: 500; font-size: 12px;">${csvRow.id}</span>
                      </div>
                      <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                        <span style="color: #6b7280; font-size: 12px;">Revenue:</span>
                        <span style="color: #111827; font-weight: 500; font-size: 12px;">$${formatNumber(csvRow.revenue)}</span>
                      </div>
                      <div style="display: flex; justify-content: space-between;">
                        <span style="color: #6b7280; font-size: 12px;">Cost:</span>
                        <span style="color: #111827; font-weight: 500; font-size: 12px;">$${formatNumber(csvRow.cost)}</span>
                      </div>
                    </div>
                  </div>`,
                  {
                    className: 'custom-popup',
                  }
                )
              } else {
                // Show basic info if no CSV data, including the ID for debugging
                layer.bindPopup(
                  `<div style="font-family: system-ui, -apple-system, sans-serif; min-width: 200px;">
                    <div style="font-weight: 600; font-size: 14px; margin-bottom: 8px; color: #1f2937;">
                      ${featureName}
                    </div>
                    <div style="border-top: 1px solid #e5e7eb; padding-top: 8px;">
                      ${featureId ? `
                        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                          <span style="color: #6b7280; font-size: 12px;">Feature ID:</span>
                          <span style="color: #111827; font-weight: 500; font-size: 12px; font-family: monospace;">${featureId}</span>
                        </div>
                      ` : ''}
                      <div style="color: #dc2626; font-size: 12px; margin-top: ${featureId ? '6px' : '0'};">
                        No CSV data found for this ID
                      </div>
                      ${csvRows.length > 0 ? `
                        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb;">
                          <div style="color: #6b7280; font-size: 11px; margin-bottom: 4px;">Available CSV IDs:</div>
                          <div style="color: #111827; font-size: 11px; font-family: monospace; max-height: 100px; overflow-y: auto;">
                            ${csvRows.map(row => row.id).join(', ')}
                          </div>
                        </div>
                      ` : ''}
                    </div>
                  </div>`,
                  {
                    className: 'custom-popup',
                  }
                )
              }
            }}
          />
        )}
      </MapContainer>
    </div>
  )
}

export default App
