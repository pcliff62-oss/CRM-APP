export default function NewProposalPage({ params }: { params: { customerId: string } }) {
	return (
		<div style={{ padding: 16 }}>
			<h1>New Proposal</h1>
			<p>Customer ID: {params.customerId}</p>
			<p>This page is a placeholder. Implement form and flow as needed.</p>
		</div>
	);
}

