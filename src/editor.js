!(function () {
  const defaultZoom = 15;

  class Editor {
    constructor(rootEl, workspaceEl) {
      this.rootEl = rootEl;
      this.workspaceEl = workspaceEl;
      this.open = this.open.bind(this);
      this.close = this.close.bind(this);
    }

    open({ value, mode, callback }) {
      this.rootEl.classList.add("open");

      if (!this.map) {
        this.map = L.map(this.workspaceEl).setView([51.505, -0.09], 13);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "© OpenStreetMap",
        }).addTo(this.map);
      }

      this.value = value;
      this.callbackFn = callback;
      this.disposeFn = mode.setUp(this);
    }

    close(fireCallback) {
      if (typeof this.disposeFn === "function") {
        this.disposeFn();
      }
      if (fireCallback && typeof this.callbackFn === "function") {
        this.callbackFn(this.value);
      }

      this.callback = this.value = this.destroyEditor = null;
      this.rootEl.classList.remove("open");
    }
  }

  function createEditor() {
    if (window.__MapEditor__) return window.__MapEditor__;

    const editorRoot = document.body.appendChild(document.createElement("div"));
    editorRoot.classList.add("MapEditor");

    const editorBg = editorRoot.appendChild(document.createElement("div"));
    editorBg.classList.add("MapEditor-background");

    const editorWindow = editorRoot.appendChild(document.createElement("div"));
    editorWindow.classList.add("MapEditor-window");

    const toolbar = editorWindow.appendChild(document.createElement("div"));
    toolbar.classList.add("MapEditor-toolbar");

    const saveBtn = toolbar.appendChild(document.createElement("button"));
    saveBtn.innerText = "Save changes";

    const cancelBtn = toolbar.appendChild(document.createElement("button"));
    cancelBtn.innerText = "Cancel";

    const map = editorWindow.appendChild(document.createElement("div"));
    map.classList.add("MapEditor-map");

    const editor = new Editor(editorRoot, map);
    editorBg.addEventListener("click", () => editor.close(false));
    saveBtn.addEventListener("click", () => editor.close(true));
    cancelBtn.addEventListener("click", () => editor.close(false));

    return (window.__MapEditor__ = editor);
  }

  /**
   * @param {L.LatLng|L.LatLngLiteral} value
   * @returns {string}
   */
  function latLngToStr(value) {
    return "lat" in value ? `${value.lat},${value.lng}` : value.join(",");
  }

  function strToLatLng(value) {
    return value.split(",").map((n) => parseFloat(n));
  }

  const MapEditorModes = {
    point: {
      /**
       * @param {L.LatLng|L.LatLngLiteral} value
       * @returns {string}
       */
      serialize(value) {
        if (!value) return null;
        return latLngToStr(value);
      },

      /**
       * @param {string} value
       * @returns {L.LatLngLiteral}
       */
      deserialize(value) {
        if (!value) return null;
        return strToLatLng(value);
      },

      /**
       * @param {Editor} editor
       */
      setUp(editor) {
        const pos = editor.value || editor.defaultPosition || [51.5, -0.09];
        const marker = L.marker(pos, {
          draggable: true,
        }).addTo(editor.map);

        editor.map.setView(pos, defaultZoom);

        marker.on("moveend", () => {
          const center = marker.getLatLng();

          editor.map.setView(center);
          editor.value = [center.lat, center.lng];
        });

        return () => {
          marker.remove();
        };
      },
    },

    polygon: {
      /**
       * @param {L.LatLngLiteral} value
       * @returns {string}
       */
      serialize(value) {
        if (!value) return null;
        return value.map(latLngToStr).join(";");
      },

      /**
       * @param {string} value
       * @returns {L.LatLngLiteral}
       */
      deserialize(value) {
        if (!value) return null;
        return value.split(";").map(strToLatLng);
      },

      /**
       * @param {Editor} editor
       */
      setUp(editor) {
        const drawnItems = L.featureGroup().addTo(editor.map);
        const drawControl = new L.Control.Draw({
          edit: {
            featureGroup: drawnItems,
            poly: {
              allowIntersection: false,
            },
          },
          draw: {
            circle: false,
            circlemarker: false,
            marker: false,
            polyline: false,
            rectangle: false,
            polygon: { showArea: true },
          },
        });

        editor.map.addControl(drawControl);

        function setValue(poly) {
          if (poly) {
            const layer1 = poly.getLatLngs()[0];
            if (layer1) {
              editor.value = layer1;
            }
          }
        }

        function drawingCreated(ev) {
          drawnItems.clearLayers();
          drawnItems.addLayer(ev.layer);
          setValue(ev.layer);
        }

        function drawingEdited() {
          setValue(drawnItems.getLayers()[0]);
        }

        editor.map.on(L.Draw.Event.CREATED, drawingCreated);
        editor.map.on(L.Draw.Event.EDITED, drawingEdited);

        if (editor.value) {
          const poly = L.polygon([editor.value]);
          drawnItems.addLayer(poly);
          editor.map.fitBounds(poly.getBounds());
        }

        return () => {
          editor.map.off(L.Draw.Event.CREATED, drawingCreated);
          editor.map.off(L.Draw.Event.EDITED, drawingEdited);

          drawControl.remove();
          drawnItems.remove();
        };
      },
    },
  };

  const editor = createEditor();

  document.querySelectorAll("[data-mapeditor]").forEach((el) => {
    const editorModeName = el.getAttribute("data-mapeditor");
    const editorMode = MapEditorModes[editorModeName];
    if (!editorMode) {
      console.error(
        `Invalid map editor mode "${editorModeName}" provided for input`,
        el
      );
      return;
    }

    el.setAttribute("readonly", "readonly");
    el.addEventListener("click", async () => {
      const initialValue = editorMode.deserialize(el.value);

      editor.open({
        mode: editorMode,
        value: initialValue,
        callback(value) {
          el.value = editorMode.serialize(value);
        },
      });
    });
  });
})();
