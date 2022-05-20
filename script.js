/*
Create and Render map on div with zoom and center
*/

let regularStyle = new ol.style.Style({
  stroke: new ol.style.Stroke({
    color: "#0e97fa",
    width: 2,
  }),
  fill: new ol.style.Fill({
    color: [0, 0, 0, 0.2],
  }),
});

let highlightStyle = new ol.style.Style({
  stroke: new ol.style.Stroke({
    color: [255, 0, 0, 0.6],
    width: 2,
  }),
  fill: new ol.style.Fill({
    color: [255, 0, 0, 0.2],
  }),
  zIndex: 1,
});

const selectSingleClick = new ol.interaction.Select({ style: highlightStyle });

class OLMap {
  //Constructor accepts html div id, zoom level and center coordinaes
  constructor(map_div, zoom, center) {
    this.map = new ol.Map({
      interactions: ol.interaction.defaults({
        doubleClickZoom: false,
      }),
      target: map_div,
      layers: [
        new ol.layer.Tile({
          source: new ol.source.OSM(),
        }),
      ],
      view: new ol.View({
        center: ol.proj.fromLonLat(center),
        zoom: zoom,
      }),
    });
  }
}

/*
Create Vector Layer
*/
class VectorLayer {
  //Constructor accepts title of vector layer and map object
  constructor(title, map) {
    this.layer = new ol.layer.Vector({
      title: title,
      source: new ol.source.Vector({
        projection: map.getView().projection,
      }),
      style: regularStyle,
    });
  }
}

/*
Create overlay
*/
class Overlay {
  //Contrctor accepts map object, overlay html element, overlay offset, overlay positioning and overlay class
  constructor(
    map,
    element = document.getElementById("popup"),
    offset = [0, -15],
    positioning = "bottom-center",
    className = "ol-tooltip-measure ol-tooltip ol-tooltip-static"
  ) {
    this.map = map;
    this.overlay = new ol.Overlay({
      element: element,
      offset: offset,
      positioning: positioning,
      className: className,
    });
    this.overlay.setPosition([0, 0]);
    this.overlay.element.style.display = "block";
    this.map.addOverlay(this.overlay);
  }
}

/* 
Draw Intraction
*/
class Draw {
  //Constructor accepts geometry type, map object and vector layer
  constructor(type, map, vector_layer) {
    this.type = type;
    this.vector_layer = vector_layer;
    this.map = map;
    this.interaction = new ol.interaction.Draw({
      type: type,
      stopClick: true,
    });
    if (type === "LineString") {
      this.interaction.on("drawstart", this.onDrawStart);
    } else {
      this.vector_layer.getSource().clear();
    }
    this.interaction.on("drawend", this.onDrawEnd);
    this.map.addInteraction(this.interaction);
  }

  onDrawStart = (e) => {
    e.feature.getGeometry().on("change", this.onGeomChange);
  };

  onDrawEnd = (e) => {
    // this.map.getOverlays().clear();
    this.vector_layer.setStyle(regularStyle);
    this.map.removeInteraction(this.interaction);

    if (this.type === "Polygon") {
      this.vector_layer.getSource().addFeature(e.feature);
      polygon = e.feature;
    }
  };

  onGeomChange = (e) => {
    /*
            This function will dynamically split the polygon into two parts by a line and will follow geometry change event.
        */

    //Create jsts parser to read openlayers geometry
    let parser = new jsts.io.OL3Parser();

    //Creating line geometry from draw intraction
    let linestring = new ol.Feature({
      geometry: new ol.geom.LineString(e.target.getCoordinates()),
    });

    //Parse Polygon and Line geomtry to jsts type
    let a = parser.read(polygon.getGeometry());
    let b = parser.read(linestring.getGeometry());

    //Perform union of Polygon and Line and use Polygonizer to split the polygon by line
    let union = a.getExteriorRing().union(b);
    let polygonizer = new jsts.operation.polygonize.Polygonizer();

    //Splitting polygon in two part
    polygonizer.add(union);

    //Get splitted polygons
    let polygons = polygonizer.getPolygons();

    //This will execute only if polygon is successfully splitted into two parts
    if (polygons.array.length == 2) {
      //Clear old splitted polygons and measurement ovelays
      this.vector_layer.getSource().clear();
      this.map.getOverlays().clear();

      polygons.array.forEach((geom, index) => {
        let splitted_polygon = new ol.Feature({
          geometry: new ol.geom.Polygon(parser.write(geom).getCoordinates()),
        });

        if (index === 0) {
          splitted_polygon.setProperties({ clave: "1" });
        } else {
          splitted_polygon.setProperties({ clave: "2" });
        }

        //Add splitted polygon to vector layer
        this.vector_layer.getSource().addFeature(splitted_polygon);

        //Add area measurement overlay to splitted polygon
        let overlay = new Overlay(this.map).overlay;
        this.calArea(
          overlay,
          splitted_polygon.getGeometry().getFlatInteriorPoint(),
          splitted_polygon.getGeometry().getArea()
        );

        //Add line measurement overlay to segment of polygon
        let polyCoords = splitted_polygon.getGeometry().getCoordinates()[0];
        polyCoords.forEach((coords, i) => {
          if (i < polyCoords.length - 1) {
            let line = new ol.geom.LineString([coords, polyCoords[i + 1]]);
            let overlay = new Overlay(this.map).overlay;
            this.calDistance(overlay, line.getFlatMidpoint(), line.getLength());
          }
        });
      });

      //Change Style of Splitted polygons
      this.vector_layer.setStyle(highlightStyle);
    } else {
      //Change style to normal if polgon is not splitted
      this.vector_layer.setStyle(regularStyle);

      //Clear measurement overlays and splitted polygon if line is not completely intersected with polygon
      this.map.getOverlays().clear();
      this.vector_layer.getSource().clear();

      //Add original polygon to vector layer if no intersection is there between line and polygon
      this.vector_layer.getSource().addFeature(polygon);
    }
  };

  onGeomChange2 = (e) => {
    //Add area measurement overlay to splitted polygon
    let overlay = new Overlay(this.map).overlay;
    this.calArea(
      overlay,
      splitted_polygon.getGeometry().getFlatInteriorPoint(),
      splitted_polygon.getGeometry().getArea()
    );
  };

  //Calculates the length of a segment and position the overlay at the midpoint of it.
  calDistance = (overlay, overlayPosition, distance) => {
    if (parseInt(distance) == 0) {
      overlay.setPosition([0, 0]);
    } else {
      overlay.setPosition(overlayPosition);
      if (distance >= 1000) {
        overlay.element.innerHTML =
          "<b>" + (distance / 1000).toFixed(2) + " km</b>";
      } else {
        overlay.element.innerHTML = "<b>" + distance.toFixed(2) + " m</b>";
      }
    }
  };

  calArea = (overlay, overlayPosition, area) => {
    if (parseInt(area) == 0) {
      overlay.setPosition([0, 0]);
    } else {
      overlay.setPosition(overlayPosition);
      if (area >= 10000) {
        overlay.element.innerHTML =
          "<b>" +
          Math.round((area / 1000000) * 100) / 100 +
          " km<sup>2<sup></b>";
      } else {
        overlay.element.innerHTML =
          "<b>" + Math.round(area * 100) / 100 + " m<sup>2<sup></b>";
      }
    }
  };
}

// **************
//Add Modify Control to map
// let modifyClick = (e) => {
//   //Remove previous interactions
//   removeInteractions();

//   //Select Features
//   let select = new ol.interaction.Select({
//     layers: [vector_layer],
//     style: highlightStyle,
//   });

//   //Add Modify Control to map
//   let modify = new ol.interaction.Modify({
//     source: vector_layer.getSource(),
//   });

//   snap = new ol.interaction.Snap({
//     source: vector_layer.getSource(),
//   });

//   map.addInteraction(snap);
//   map.addInteraction(select);
//   map.addInteraction(modify);
// };

/* 
Modify Intraction
*/
class Modify {
  //Constructor accepts geometry type, map object and vector layer
  constructor(type, map, vector_layer) {
    this.type = "polygon";
    console.log(type);
    this.vector_layer = vector_layer.getSource();
    this.features = vector_layer.getSource().getFeatures();
    // console.log(this.features);
    this.map = map;

    this.interaction = new ol.interaction.Modify({
      source: this.vector_layer,
    });
    this.interaction.on("modifystart", this.onModifyStart);
    // this.interaction
    this.interaction.on("modify", this.onModifyEnd);
    this.map.addInteraction(this.interaction);
  }

  onModifyStart = (e) => {
    console.log();
    e.features[0].getGeometry().on("change", this.onGeomChange2);
    // e.features[0];
  };

  onModifyEnd = (e) => {
    // this.map.getOverlays().clear();
    this.vector_layer.setStyle(regularStyle);
    this.map.removeInteraction(this.interaction);

    if (this.type === "Polygon") {
      this.vector_layer.getSource().addFeature(e.feature);
      polygon = e.feature;
    }
  };

  onGeomChange2 = (e) => {
    console.log("change");
    //This will execute only if polygon is successfully splitted into two parts
    if (vector_layer.getSource().getFeatures().length == 2) {
      //Clear old splitted polygons and measurement ovelays
      this.vector_layer.getSource().clear();
      this.map.getOverlays().clear();

      polygons = this.vector_layer.getSource().getFeatures();

      polygons.forEach((geom, index) => {
        let splitted_polygon = new ol.Feature({
          geometry: new ol.geom.Polygon(parser.write(geom).getCoordinates()),
        });

        //Add splitted polygon to vector layer
        this.vector_layer.getSource().addFeature(splitted_polygon);

        //Add area measurement overlay to splitted polygon
        let overlay = new Overlay(this.map).overlay;
        this.calArea(
          overlay,
          splitted_polygon.getGeometry().getFlatInteriorPoint(),
          splitted_polygon.getGeometry().getArea()
        );

        //Add line measurement overlay to segment of polygon
        let polyCoords = splitted_polygon.getGeometry().getCoordinates()[0];
        polyCoords.forEach((coords, i) => {
          if (i < polyCoords.length - 1) {
            let line = new ol.geom.LineString([coords, polyCoords[i + 1]]);
            let overlay = new Overlay(this.map).overlay;
            this.calDistance(overlay, line.getFlatMidpoint(), line.getLength());
          }
        });
      });

      //Change Style of Splitted polygons
      this.vector_layer.setStyle(highlightStyle);
    } else {
      //Change style to normal if polgon is not splitted
      this.vector_layer.setStyle(regularStyle);

      //Clear measurement overlays and splitted polygon if line is not completely intersected with polygon
      this.map.getOverlays().clear();
      this.vector_layer.getSource().clear();

      //Add original polygon to vector layer if no intersection is there between line and polygon
      this.vector_layer.getSource().addFeature(polygon);
    }
  };

  calArea = (overlay, overlayPosition, area) => {
    if (parseInt(area) == 0) {
      overlay.setPosition([0, 0]);
    } else {
      overlay.setPosition(overlayPosition);
      if (area >= 10000) {
        overlay.element.innerHTML =
          "<b>" +
          Math.round((area / 1000000) * 100) / 100 +
          " km<sup>2<sup></b>";
      } else {
        overlay.element.innerHTML =
          "<b>" + Math.round(area * 100) / 100 + " m<sup>2<sup></b>";
      }
    }
  };
}

/* 
Enable snapping on a vector layer
*/
class Snapping {
  //Constructor accepts geometry type, map object and vector layer
  constructor(map, vector_source) {
    this.map = map;
    this.vector_source = vector_source;
    this.interaction = new ol.interaction.Snap({
      source: vector_source,
    });
    this.map.addInteraction(this.interaction);
  }
}

//Create map and vector layer
let map = new OLMap("map", 9, [-96.6345990807462, 32.81890764151014]).map;
let vector_layer = new VectorLayer("Temp Layer", map).layer;
map.addLayer(vector_layer);
featureSelected = null;

// Quitar es estilo de resaltado al poligono seleccionado al cerrar la ventana modal.
$("#modal-close-btn").click(function () {
  featureSelected.setStyle(regularStyle);
});

let polygon = new ol.Feature({
  geometry: new ol.geom.Polygon([
    [
      [-10852646.620625805, 3906819.5017894786],
      [-10797367.365502242, 3950847.234747086],
      [-10691456.211645748, 3911711.47159973],
      [-10687298.044771587, 3848605.062913627],
      [-10777554.891503, 3804332.7398631293],
      [-10864387.34630427, 3834907.5511772],
      [-10852646.620625805, 3906819.5017894786],
    ],
  ]),
});

vector_layer.getSource().addFeature(polygon);

//Add Interaction to map depending on your selection
let draw = null;
let btnClick = (e) => {
  removeInteractions();
  let geomType = e.srcElement.attributes.geomtype.nodeValue;

  //Create interaction
  draw = new Draw(geomType, map, vector_layer);
  if (geomType == "LineString") {
    new Snapping(map, vector_layer.getSource());
  }
};

let btnClick2 = (e) => {
  removeInteractions();
  let geomType = "polygon";

  //Create interaction
  modify = new Modify(geomType, map, vector_layer);
  // new Snapping(map, vector_layer.getSource());
};

//Remove map interactions except default interactions
let removeInteractions = () => {
  map
    .getInteractions()
    .getArray()
    .forEach((interaction, i) => {
      if (i > 8) {
        map.removeInteraction(interaction);
      }
    });
};

//Drag feature
let dragFeature = () => {
  removeInteractions();
  map.addInteraction(new ol.interaction.Translate());
};

//Clear vector features and overlays and remove any interaction
let clear = () => {
  removeInteractions();
  map.getOverlays().clear();
  vector_layer.getSource().clear();
};

// Abrir ventana modal
let showModal = function (evt) {
  // Seleccionar el elemento con click en el mapa
  var feature = map.forEachFeatureAtPixel(evt.pixel, function (feature) {
    return feature;
  });
  // Si el elemento es un 'feature'...
  if (feature) {
    // Cambiar su estilo
    feature.setStyle(highlightStyle);
    // Guardar el elemento en la variable `featureSelected` para despues poder quitar el estilo.
    featureSelected = feature;
    // Inlcuir la clave en el input tipo texto de la ventana modal
    $("#clave").val(feature.getProperties().clave);
    // Simular un click al boton que muestra el modal
    $("#modal-btn").click();
  }
};

// Activar/Desactivar funcionalidad de editar clave
let editarClave = () => {
  // Si el botn ya tiene la clase 'active' desactivar la funcion.
  if ($("#btn5").hasClass("active")) {
    removeInteractions();
    map.un("click", showModal);
  } else {
    // Si el botn NO tiene la clase 'active' activar la funcion.
    removeInteractions();
    map.on("click", showModal);
  }
  // Agregar/Quitar color del borde
  $("#btn5").toggleClass("active");
};

//Bind methods to click events of buttons
let distanceMeasure = document.getElementById("btn1");
distanceMeasure.onclick = btnClick;

let areaMeasure = document.getElementById("btn2");
areaMeasure.onclick = btnClick;

let clearGraphics = document.getElementById("btn3");
clearGraphics.onclick = clear;

let drag = document.getElementById("btn4");
drag.onclick = dragFeature;

// Agregar función al hacer click en el boton.
let claveEdit = document.getElementById("btn5");
claveEdit.onclick = editarClave;

let modify_btn = document.getElementById("btn6");
modify_btn.onclick = btnClick2;

//Add Modify Control to map
// let modifyClick = (e) => {
//   //Remove previous interactions
//   removeInteractions();

//   //Select Features
//   let select = new ol.interaction.Select({
//     layers: [vector_layer],
//     style: highlightStyle,
//   });

//   //Add Modify Control to map
//   let modify = new ol.interaction.Modify({
//     source: vector_layer.getSource(),
//   });

//   snap = new ol.interaction.Snap({
//     source: vector_layer.getSource(),
//   });

//   map.addInteraction(snap);
//   map.addInteraction(select);
//   map.addInteraction(modify);
// };

// let snap;

// function addInteractions() {
//   draw = new ol.interaction.Draw({
//     type: "Polygon",
//     source: vector_layer,
//   });
//   map.addInteraction(draw2);
//   // snap = new ol.interaction.Snap({ source: vector_layer });
//   // map.addInteraction(snap);
// }

// function addInteractions() {
//   draw2 = new ol.interaction.Draw({
//     source: vector_layer,
//     type: "Polygon",
//   });
//   map.addInteraction(draw2);
//   snap = new ol.interaction.Snap({ source: vector_layer });
//   map.addInteraction(snap);
// }

/**
 * Handle change event.
 */

// addInteractions();
