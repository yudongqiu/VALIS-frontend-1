// Dependencies
import React, { Component } from 'react';
import PropTypes from 'prop-types';

import AutoComplete from 'material-ui/AutoComplete';
import MenuItem from 'material-ui/MenuItem';
import DropDownMenu from 'material-ui/DropDownMenu';
import { Toolbar, ToolbarGroup } from 'material-ui/Toolbar';
import IconButton from 'material-ui/IconButton';
import NavigationArrowBack from 'material-ui/svg-icons/navigation/arrow-back';
import NavigationArrowForward from 'material-ui/svg-icons/navigation/arrow-forward';

import { CHROMOSOME_SIZES } from '../../helpers/constants.js';

import './Header.scss';

import GenomeAPI from '../../models/api.js';

class Header extends Component {
  constructor(props) {
    super(props);
    this.onNewRequest = this.onNewRequest.bind(this);
    this.onUpdateSearchFilter = this.onUpdateSearchFilter.bind(this);
    this.api = new GenomeAPI();
    const chromosomes = [];
    let start = 0;
    for (let i = 0; i < 23; i++) {
      let name = '';
      if (i <= 20) {
        name = 'Chromosome ' + (i+1);
      } else if (i === 21) {
        name = 'X Chromosome';
      } else if (i === 22) {
        name = 'Y Chromosome';
      }
      const end = start + CHROMOSOME_SIZES[i];
      chromosomes.push({
        resultType: 'location',
        name: name,
        range: [start, end],
      });
      start += CHROMOSOME_SIZES[i];
    }
    this.state = {
      dataSource : chromosomes,
      inputValue : '',
      searchFilter: 1,
    };
  }

  componentDidMount() {
    this.api.getAnnotations().then(result => {
      const tracks = result.map(d => { return { name: d, resultType: 'annotation' }; });
      this.setState({
        dataSource: this.state.dataSource.concat(tracks),
      });
    });

    this.api.getTracks().then(result => {
      const dataTracks = result.map(d => { return { name: d, resultType: 'data' }; });
      this.setState({
        dataSource: this.state.dataSource.concat(dataTracks),
      });
    });
  }

  onUpdateSearchFilter(event, index, value) {
    this.setState({
      searchFilter: value,
    });
  }

  onNewRequest(chosen, index) {
    if (index > -1) {
      if (chosen.resultType === 'data') {
        this.props.model.addDataTrack(chosen.name);  
      } else if (chosen.resultType === 'annotation') {
        this.props.model.addAnnotationTrack(chosen.name);
      } else if (chosen.resultType === 'location') {
        const viewState = this.props.viewModel.getViewState();
        const bpp = (chosen.range[1] - chosen.range[0]) / viewState.windowSize[0];
        this.props.viewModel.setViewRegion(chosen.range[0], bpp);
      }
    }
  }

  render() {
    const dataSourceConfig = {
      text: 'name',
      value: 'name',
    };
    return (<div className="header">
      <Toolbar>

        <ToolbarGroup firstChild={true}>
          <IconButton onClick={() => this.props.viewModel.back()}>
            <NavigationArrowBack />
          </IconButton>
          <IconButton onClick={() => this.props.viewModel.forward()}>
            <NavigationArrowForward />
          </IconButton>
          <div className="search-box">
            <AutoComplete
              hintText="Search Genomes or Variants"
              dataSource={this.state.dataSource}
              onNewRequest={this.onNewRequest}
              dataSourceConfig={dataSourceConfig}
              filter={AutoComplete.caseInsensitiveFilter}
              maxSearchResults={8}
              fullWidth={true}
            />
          </div>
          <DropDownMenu value={this.state.searchFilter}  onChange={this.onUpdateSearchFilter}>
            <MenuItem value={1} primaryText="Everything" />
            <MenuItem value={2} primaryText="Genomes" />
            <MenuItem value={3} primaryText="Genes" />
            <MenuItem value={4} primaryText="SNPs" />
          </DropDownMenu>
        </ToolbarGroup>
      </Toolbar>
    </div>);
  }
}

Header.propTypes = {
   model: PropTypes.object,
   viewModel: PropTypes.object,
};

export default Header;
