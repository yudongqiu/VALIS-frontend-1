// Dependencies
import * as React from 'react';
import * as PropTypes from 'prop-types';
import DataListItem from '../DataListItem/DataListItem';
import { SiriusApi } from 'valis';
import {
  TRACK_TYPE_NETWORK,
} from '../../helpers/constants';

// Styles
import './TrackSelector.scss';

class TrackSelector extends React.Component {
  constructor(props) {
    super(props);
    this.appModel = props.appModel;
    this.viewModel = props.viewModel;
    this.api = this.appModel.api;
    this.state = {
      tracks: [],
    };
  }

  componentDidMount() {
    if (this.props.trackType !== TRACK_TYPE_NETWORK) {
      SiriusApi.getTracks().then(result => {
        this.setState({
          tracks: result,
        });
      });
    } else {
      SiriusApi.getGraphs().then(result => {
        this.setState({
          tracks: result,
        });
      });
    }
  }

  trackSelected(track) {
    if (this.props.trackType !== TRACK_TYPE_NETWORK) {
      this.appModel.addDataTrack(track);
    } else {
      this.appModel.addAnnotationTrack('cross-track-test-1');
      this.appModel.addAnnotationTrack('cross-track-test-2');
      this.appModel.addGraphOverlay(track, 'cross-track-test-1', 'cross-track-test-2');
    }
  }

  render() {
    const trackItems = this.state.tracks.map(track => {
      return (<DataListItem
        title={track.name}
        description={''}
        onClick={() => this.trackSelected(track.id)}
        key={track.id}
      />);
    });
    return (<div className="track-selector">{trackItems}</div>);
  }
}

TrackSelector.propTypes = {
  appModel: PropTypes.object,
  viewModel: PropTypes.object,
  trackType: PropTypes.string,
};


export default TrackSelector;
