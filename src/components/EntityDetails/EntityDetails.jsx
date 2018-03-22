// Dependencies
import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { CHROMOSOME_NAMES } from '../../helpers/constants.js';

// Styles
import './EntityDetails.scss';


class EntityDetails extends Component {
	render() {
		if (!this.props.entity || !this.props.entity.info) return (<div />);
		const entity = this.props.entity;
		const info = this.props.entity.info;
		let description = '';
		try {
			description = unescape(info.attributes.description);
		} catch (err) {
			description = '';
		}
		return (
			<div className="entity-details">
				<div className="entity-header">
						<div className="entity-name">{info.name}</div>
					<div className="entity-desc">{description}</div>
				</div>
				<table className="detail-item">
					<tr>
						<td className="detail-header">location</td>
						<td className="detail-value">{entity.assembly} {CHROMOSOME_NAMES[entity.chromid-1]}</td>
					</tr>
					<tr>
						<td className="detail-header">start</td>
						<td className="detail-value">{entity.start}</td>
					</tr>
					<tr>
						<td className="detail-header">end</td>
						<td className="detail-value">{entity.end}</td>
					</tr>
				</table>
			</div>);
	}
}

EntityDetails.propTypes = {
   entity: PropTypes.object,
};

export default EntityDetails;
