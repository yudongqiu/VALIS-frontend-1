import React, { Component } from 'react';
import PropTypes from 'prop-types';
import ZoomIn from 'material-ui/svg-icons/action/zoom-in';
import IconButton from 'material-ui/IconButton';
import RaisedButton from 'material-ui/RaisedButton';

// Styles
import './ZoomToButton.scss';

class ZoomToButton extends Component {
  constructor(props) {
    super(props);
    this.zoom = this.zoom.bind(this);
  }

  zoom() {
    const { start, end, padding } = this.props;
    const totalRange = (1.0 + padding) * (end - start);
    const finalStart = start + (start + end - totalRange) / 2.0;
    const finalEnd = start + (start + end + totalRange) / 2.0;
    this.props.viewModel.setViewRegionUsingRange(finalStart, finalEnd);
  }

  render() {
    return (<IconButton><ZoomIn onClick={this.zoom} /></IconButton>);
  }
}

ZoomToButton.propTypes = {
  viewModel: PropTypes.object,
  start: PropTypes.number,
  end: PropTypes.number,
  padding: PropTypes.number,
  
};

export default ZoomToButton;
