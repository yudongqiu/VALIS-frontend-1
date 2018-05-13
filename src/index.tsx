import * as React from "react";
import * as ReactDOM from "react-dom";
import GPUTextFonts from "./fonts/GPUTextFonts";

import App from "./components/App/App";
import "./index.scss";

function renderApp() {
  GPUTextFonts.init();
  ReactDOM.render(React.createElement(App), document.getElementById("main"));
}

renderApp(); // Renders App on init
