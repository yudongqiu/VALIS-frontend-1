// Dependencies
import React from 'react';
import MuiThemeProvider from 'material-ui/styles/MuiThemeProvider';
import getMuiTheme from 'material-ui/styles/getMuiTheme';
import LinearProgress from 'material-ui/LinearProgress';

// Components
import Header from '../Header/Header.jsx';
import EntityDetails from '../EntityDetails/EntityDetails.jsx';
import TrackViewSettings from '../TrackViewSettings/TrackViewSettings.jsx';
import MultiTrackViewer from '../MultiTrackViewer/MultiTrackViewer.jsx';
import NavigationController from '../NavigationController/NavigationController.jsx';

import AppModel, {
  APP_EVENT_LOADING_STATE_CHANGED,
} from '../../models/appModel.js';


import ViewModel, {
  VIEW_EVENT_EDIT_TRACK_VIEW_SETTINGS,
  VIEW_EVENT_SHOW_ENTITY_DETAIL,
  VIEW_EVENT_DATA_SET_SELECTED,
  VIEW_EVENT_PUSH_VIEW,
  VIEW_EVENT_POP_VIEW,
  VIEW_EVENT_CLOSE_VIEW,

} from '../../models/viewModel.js';
// Styles
import './App.scss';

const _ = require('underscore');

class App extends React.Component {
  constructor(props) {
    super(props);
    this.updateLoadingState = this.updateLoadingState.bind(this);
  }

  componentDidMount() {
    this.setState({
      tracks: [],
      views: [],
      loading: false,
    });

    this.popView = this.popView.bind(this);
    this.pushView = this.pushView.bind(this);
    this.closeView = this.closeView.bind(this);
    this.showTrackSettings = this.showTrackSettings.bind(this);
    this.showEntityDetails = this.showEntityDetails.bind(this);

    this.viewModel = new ViewModel();
    this.appModel = new AppModel();
    this.appModel.addDataTrack('sequence');
    this.appModel.addAnnotationTrack('GRCh38');

    this.appModel.addListener(this.updateLoadingState, APP_EVENT_LOADING_STATE_CHANGED);
    this.viewModel.addListener(this.showEntityDetails, VIEW_EVENT_SHOW_ENTITY_DETAIL);
    this.viewModel.addListener(this.showTrackSettings, VIEW_EVENT_EDIT_TRACK_VIEW_SETTINGS);
    this.viewModel.addListener(this.dataSetSelected, VIEW_EVENT_DATA_SET_SELECTED);
    this.viewModel.addListener(this.popView, VIEW_EVENT_POP_VIEW);
    this.viewModel.addListener(this.pushView, VIEW_EVENT_PUSH_VIEW);
    this.viewModel.addListener(this.closeView, VIEW_EVENT_CLOSE_VIEW);
  }

  showEntityDetails(event) {
    if (event.data !== null) {
      if (event.data.aggregation === true) {
        // if the annotation is an aggregation then zoom
        this.viewModel.setViewRegionUsingRange(event.data.startBp, event.data.endBp);
      } else if (this.currentView() && event.data.id === this.currentView().info) {
        this.appModel.popView();
      } else {
          let title = '';
          if (event.data.title) {
            title = event.data.title;
          }
          const dataID = event.data.id;
          // pop any previous entity detail view:
          if (this.currentView() && this.currentView().view.type.prototype instanceof EntityDetails) {
            this.viewModel.popView();
          }
          const elem = (<EntityDetails viewModel={this.viewModel} appModel={this.appModel} dataID={dataID} />);
          this.viewModel.pushView(title, dataID, elem);
      }
    }
  }

  popView() {
    const viewsCopy = this.state ? this.state.views.slice() : [];
    viewsCopy.pop();
    this.setState({
      views: viewsCopy,
    });
  }

  pushView(view) {
    const viewsCopy = this.state ? this.state.views.slice() : [];
    viewsCopy.push(view.data);
    this.setState({
      views: viewsCopy,
    });
  }

  closeView() {
    this.setState({
      views: [],
    });
  }

  currentView() {
    if (!this.state || this.state.views.length === 0) return null;
    return this.state.views[this.state.views.length - 1];
  }

  showTrackSettings(event) {
    if (event.data !== null) {
      if (this.currentView() && event.data === this.currentView().info) {
        this.appModel.popView();
      } else {
        const elem = (<TrackViewSettings guid={event.data} viewModel={this.viewModel} model={this.appModel} />);
        this.viewModel.pushView('Track Settings', event.data, elem);
      }
    }
  }

  updateLoadingState(event) {
    this.setState({
      loading: event.data,
    });
  }

  render() {
    if (!this.state) return (<div />);
    const color = this.state.loading ? '' : 'transparent';
    const progress =  (<LinearProgress color={color} />);
    const views = this.state.views;

    return (
      <MuiThemeProvider>
        <div className="site-wrapper">
          <Header viewModel={this.viewModel} model={this.appModel} viewModel={this.viewModel} />
          {progress}
          <MultiTrackViewer model={this.appModel} viewModel={this.viewModel} />
          <NavigationController viewModel={this.viewModel} views={views} />
        </div>
      </MuiThemeProvider>);
  }
}

export default App;
